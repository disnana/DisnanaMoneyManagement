import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.Set;
import java.util.jar.JarFile;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.bouncycastle.asn1.cms.Attribute;
import org.bouncycastle.asn1.cms.AttributeTable;
import org.bouncycastle.asn1.cms.CMSAttributes;
import org.bouncycastle.asn1.cms.Time;
import org.bouncycastle.asn1.DERSet;
import org.bouncycastle.asn1.x509.AlgorithmIdentifier;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.DefaultSignedAttributeTableGenerator;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.DefaultSignatureAlgorithmIdentifierFinder;
import org.bouncycastle.operator.RuntimeOperatorException;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;

/** Pilot only. JDK generates the standard JAR metadata, Bouncy Castle owns CMS encoding. */
public final class DeterministicAab {
    static final String MANIFEST = "META-INF/MANIFEST.MF";
    static final String SF = "META-INF/MANE.SF";
    static final String BLOCK = "META-INF/MANE.RSA";
    static final Set<String> METADATA = Set.of(MANIFEST, SF, BLOCK);
    private static final int MAX_JAR_METADATA = 4 * 1024 * 1024;

    private record Metadata(byte[] manifest, byte[] signatureFile) {}

    private static byte[] metadata(ZipFile zip, String name) throws Exception {
        var entry = zip.getEntry(name);
        if (entry == null || entry.getSize() <= 0 || entry.getSize() > MAX_JAR_METADATA) {
            throw new IllegalArgumentException("Unexpected JAR metadata size");
        }
        try (var input = zip.getInputStream(entry)) {
            var contents = input.readNBytes(MAX_JAR_METADATA + 1);
            if (contents.length != entry.getSize()) throw new IllegalArgumentException("JAR metadata size mismatch");
            return contents;
        }
    }

    private static byte[] boundedEvidence(Path path, int limit) throws Exception {
        try (var input = Files.newInputStream(path)) {
            byte[] bytes = input.readNBytes(limit + 1);
            if (bytes.length == 0 || bytes.length > limit) throw new IllegalArgumentException("Signing evidence size is outside policy");
            return bytes;
        }
    }

    private static Metadata prepare(Path unsigned, X509Certificate certificate) throws Exception {
        Path scratch = Files.createTempFile("aab-metadata-", ".zip");
        try {
            var key = (RSAPublicKey) certificate.getPublicKey();
            // The placeholder signature block is discarded. Only JDK's manifest and .SF are kept.
            try (var output = Files.newOutputStream(scratch)) {
                RemoteAabSigner.sign(unsigned, certificate, output,
                        RemoteAabSigner.checked(input -> new byte[(key.getModulus().bitLength() + 7) / 8]));
            }
            try (var zip = new ZipFile(scratch.toFile())) {
                return new Metadata(metadata(zip, MANIFEST), metadata(zip, SF));
            }
        } finally {
            Files.deleteIfExists(scratch);
        }
    }

    private static byte[] cms(Metadata metadata, X509Certificate certificate, Instant time,
            RemoteAabSigner.SignOperation operation) throws Exception {
        var signingTime = new Attribute(CMSAttributes.signingTime, new DERSet(new Time(Date.from(time))));
        var digestProvider = new JcaDigestCalculatorProviderBuilder().build();
        var signerInfoBuilder = new JcaSignerInfoGeneratorBuilder(digestProvider);
        signerInfoBuilder.setSignedAttributeGenerator(new DefaultSignedAttributeTableGenerator(new AttributeTable(signingTime)));
        var signerAlgorithm = new DefaultSignatureAlgorithmIdentifierFinder().find(RemoteAabSigner.ALGORITHM);
        var checkedOperation = RemoteAabSigner.checked(operation);
        ContentSigner signer = new ContentSigner() {
            private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            @Override public AlgorithmIdentifier getAlgorithmIdentifier() { return signerAlgorithm; }
            @Override public OutputStream getOutputStream() { return bytes; }
            @Override public byte[] getSignature() {
                if (bytes.size() == 0 || bytes.size() > RemoteAabSigner.MAX_INPUT) {
                    throw new RuntimeOperatorException("Unexpected CMS signing input size");
                }
                try {
                    return checkedOperation.sign(bytes.toByteArray());
                } catch (Exception error) {
                    throw new RuntimeOperatorException("CMS signing failed", error);
                }
            }
        };
        var generator = new CMSSignedDataGenerator();
        generator.addSignerInfoGenerator(signerInfoBuilder.build(signer, certificate));
        generator.addCertificates(new JcaCertStore(java.util.List.of(certificate)));
        return generator.generate(new CMSProcessableByteArray(metadata.signatureFile()), false).getEncoded("DER");
    }

    private static void writeEntry(ZipOutputStream zip, String name, byte[] bytes) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(bytes);
        zip.closeEntry();
    }

    private static void assemble(Path unsigned, Path output, Metadata metadata, byte[] block) throws Exception {
        try (var source = new ZipFile(unsigned.toFile());
                var zip = new ZipOutputStream(Files.newOutputStream(output))) {
            writeEntry(zip, MANIFEST, metadata.manifest());
            writeEntry(zip, SF, metadata.signatureFile());
            writeEntry(zip, BLOCK, block);
            for (var entries = source.entries(); entries.hasMoreElements();) {
                var entry = entries.nextElement();
                zip.putNextEntry(new ZipEntry(entry.getName()));
                try (var input = source.getInputStream(entry)) {
                    input.transferTo(zip);
                }
                zip.closeEntry();
            }
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 5 && args.length != 7) throw new IllegalArgumentException(
                "capture AAB certificate.pem instant proof-dir OR finalize AAB certificate.pem instant proof-dir signed.aab loopback-url");
        Path unsigned = Path.of(args[1]);
        X509Certificate certificate;
        try (var input = Files.newInputStream(Path.of(args[2]))) {
            certificate = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(input);
        }
        var time = Instant.parse(args[3]);
        var dir = Path.of(args[4]);
        Metadata metadata = prepare(unsigned, certificate);
        var key = (RSAPublicKey) certificate.getPublicKey();
        if ("capture".equals(args[0]) && args.length == 5) {
            Files.createDirectory(dir);
            Files.write(dir.resolve("MANIFEST.MF"), metadata.manifest());
            Files.write(dir.resolve("MANE.SF"), metadata.signatureFile());
            cms(metadata, certificate, time, input -> {
                Files.write(dir.resolve("input.bin"), input, StandardOpenOption.CREATE_NEW);
                return new byte[(key.getModulus().bitLength() + 7) / 8];
            });
            return;
        }
        if (!"finalize".equals(args[0]) || args.length != 7) throw new IllegalArgumentException("Unexpected mode");
        if (!MessageDigest.isEqual(metadata.manifest(), boundedEvidence(dir.resolve("MANIFEST.MF"), MAX_JAR_METADATA))
                || !MessageDigest.isEqual(metadata.signatureFile(), boundedEvidence(dir.resolve("MANE.SF"), MAX_JAR_METADATA))) {
            throw new IllegalArgumentException("JAR metadata differs from verifier evidence");
        }
        byte[] input = boundedEvidence(dir.resolve("input.bin"), RemoteAabSigner.MAX_INPUT);
        byte[] block = cms(metadata, certificate, time,
                RemoteAabSigner.remoteOperation(URI.create(args[6]), input, key));
        Path output = Path.of(args[5]).toAbsolutePath();
        Path temporary = Files.createTempFile(output.getParent(), "signed-aab-", ".tmp");
        try {
            assemble(unsigned, temporary, metadata, block);
            verifyContents(temporary, certificate);
            Files.move(temporary, output);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static void verifyContents(Path output, X509Certificate certificate) throws Exception {
        try (var jar = new JarFile(output.toFile(), true)) {
            for (var entries = jar.entries(); entries.hasMoreElements();) {
                var entry = entries.nextElement();
                if (entry.isDirectory() || METADATA.contains(entry.getName())) continue;
                try (var source = jar.getInputStream(entry)) { source.transferTo(OutputStream.nullOutputStream()); }
                var signers = entry.getCodeSigners();
                if (signers == null || signers.length != 1
                        || !certificate.equals(signers[0].getSignerCertPath().getCertificates().getFirst())) {
                    throw new SecurityException("Entry lacks the expected single signature: " + entry.getName());
                }
            }
        }
    }
}
