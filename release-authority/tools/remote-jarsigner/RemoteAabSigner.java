import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.AlgorithmParameters;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Provider;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.security.SignatureSpi;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.util.List;
import java.util.zip.ZipFile;
import jdk.security.jarsigner.JarSigner;

/** Local experiment: JDK owns JAR and CMS construction; the provider delegates the RSA operation. */
public final class RemoteAabSigner {
    static final String ALGORITHM = "SHA256withRSA";
    static final int MAX_INPUT = 64 * 1024;
    static final Handle HANDLE = new Handle();

    private static final class Handle implements PrivateKey {
        public String getAlgorithm() { return "RSA"; }
        public String getFormat() { return null; }
        public byte[] getEncoded() { return null; }
    }

    @FunctionalInterface
    interface SignOperation {
        byte[] sign(byte[] input) throws Exception;
    }

    private static Provider provider(SignOperation operation) {
        return new Provider("DisnanaAabPoC", "1", "AAB signing experiment") {
            {
                putService(new Service(this, "Signature", ALGORITHM, RemoteSignature.class.getName(), null, null) {
                    @Override public Object newInstance(Object parameter) { return new RemoteSignature(operation); }
                });
            }
        };
    }

    public static final class RemoteSignature extends SignatureSpi {
        private final SignOperation operation;
        private final ByteArrayOutputStream input = new ByteArrayOutputStream();
        private boolean initialized;
        private RemoteSignature(SignOperation operation) { this.operation = operation; }

        @Override protected void engineInitSign(PrivateKey key) throws InvalidKeyException {
            if (key != HANDLE) throw new InvalidKeyException("Expected the non-exportable handle");
            input.reset();
            initialized = true;
        }

        @Override protected void engineUpdate(byte value) throws SignatureException {
            engineUpdate(new byte[] {value}, 0, 1);
        }

        @Override protected void engineUpdate(byte[] bytes, int offset, int length) throws SignatureException {
            if (!initialized || length > MAX_INPUT - input.size()) throw new SignatureException("Signing input exceeds the limit");
            input.write(bytes, offset, length);
        }

        @Override protected byte[] engineSign() throws SignatureException {
            if (!initialized || input.size() == 0) throw new SignatureException("Missing signing input");
            try {
                return operation.sign(input.toByteArray());
            } catch (Exception error) {
                throw new SignatureException(error);
            } finally {
                initialized = false;
                input.reset();
            }
        }

        @Override protected void engineInitVerify(PublicKey key) { throw new UnsupportedOperationException(); }
        @Override protected boolean engineVerify(byte[] signature) { throw new UnsupportedOperationException(); }
        @Override protected AlgorithmParameters engineGetParameters() { return null; }
        @SuppressWarnings("deprecation")
        @Override protected void engineSetParameter(String parameter, Object value) { throw new UnsupportedOperationException(); }
        @SuppressWarnings("deprecation")
        @Override protected Object engineGetParameter(String parameter) { throw new UnsupportedOperationException(); }
    }

    static void sign(Path aab, X509Certificate certificate, OutputStream output, SignOperation sign) throws Exception {
        var certificates = CertificateFactory.getInstance("X.509").generateCertPath(List.of(certificate));
        var signer = new JarSigner.Builder(HANDLE, certificates)
                .digestAlgorithm("SHA-256")
                .signatureAlgorithm(ALGORITHM, provider(sign))
                .signerName("MANE")
                .build();
        try (var zip = new ZipFile(aab.toFile())) {
            signer.sign(zip, output);
        }
    }

    static SignOperation checked(SignOperation operation) {
        return new SignOperation() {
            private boolean used;
            @Override public byte[] sign(byte[] input) throws Exception {
                if (used) throw new SignatureException("Unexpected second signature operation");
                used = true;
                return operation.sign(input);
            }
        };
    }

    static SignOperation remoteOperation(URI url, byte[] expected, RSAPublicKey publicKey) {
        if (!"http".equals(url.getScheme()) || !"127.0.0.1".equals(url.getHost())
                || !"/aab-proof".equals(url.getRawPath()) || url.getRawQuery() != null
                || url.getRawFragment() != null || url.getUserInfo() != null) {
            throw new IllegalArgumentException("The test signer only accepts the loopback fixture");
        }
        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        return input -> {
            if (!MessageDigest.isEqual(expected, input)) throw new SignatureException("Signing bytes differ from verifier evidence");
            var response = client.send(HttpRequest.newBuilder(url).timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/octet-stream")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(input)).build(), HttpResponse.BodyHandlers.ofInputStream());
            int signatureSize = (publicKey.getModulus().bitLength() + 7) / 8;
            byte[] signature;
            try (var body = response.body()) {
                if (response.statusCode() != 200) throw new SignatureException("Test signer refused the fixed AAB proof");
                signature = body.readNBytes(signatureSize + 1);
            }
            if (signature.length != signatureSize) {
                throw new SignatureException("Test signer refused the fixed AAB proof");
            }
            var verifier = Signature.getInstance(ALGORITHM);
            verifier.initVerify(publicKey);
            verifier.update(input);
            if (!verifier.verify(signature)) throw new SignatureException("Remote signature does not match the upload certificate");
            return signature;
        };
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 4 && args.length != 6) throw new IllegalArgumentException(
                "capture AAB certificate.pem signing-input.bin OR finalize AAB certificate.pem signing-input.bin signed.aab loopback-url");
        var mode = args[0];
        Path bundle = Path.of(args[1]);
        var factory = CertificateFactory.getInstance("X.509");
        var certificate = (X509Certificate) factory.generateCertificate(new ByteArrayInputStream(Files.readAllBytes(Path.of(args[2]))));
        var publicKey = (RSAPublicKey) certificate.getPublicKey();
        Path expectedPath = Path.of(args[3]);
        if ("capture".equals(mode) && args.length == 4) {
            // No signature from this pass is retained. JDK constructs it with a placeholder.
            sign(bundle, certificate, OutputStream.nullOutputStream(), checked(input -> {
                Files.write(expectedPath, input, java.nio.file.StandardOpenOption.CREATE_NEW);
                return new byte[(publicKey.getModulus().bitLength() + 7) / 8];
            }));
            return;
        }
        if (!"finalize".equals(mode) || args.length != 6) throw new IllegalArgumentException("Unexpected mode");
        Path outputPath = Path.of(args[4]);
        // Keep an existing output intact and remove a partial result on failure.
        var stream = Files.newOutputStream(outputPath, java.nio.file.StandardOpenOption.CREATE_NEW);
        boolean complete = false;
        try (stream) {
            sign(bundle, certificate, stream, checked(remoteOperation(URI.create(args[5]), Files.readAllBytes(expectedPath), publicKey)));
            stream.flush();
            complete = true;
        } finally {
            if (!complete) Files.deleteIfExists(outputPath);
        }
    }
}
