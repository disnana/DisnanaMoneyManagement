import importlib.util
import tempfile
import unittest
import warnings
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

path = Path(__file__).parent.parent / "tools" / "aab-verifier" / "verify.py"
spec = importlib.util.spec_from_file_location("aab_verify", path)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

fixture = [("BundleConfig.pb", b"bundle"), ("base/manifest/AndroidManifest.xml", b"manifest")]


class ZipValidationTest(unittest.TestCase):
    def archive(self, extra=()):
        directory = Path(self.enterContext(tempfile.TemporaryDirectory()))
        path = directory / "bundle.aab"
        with warnings.catch_warnings(), ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
            warnings.simplefilter("ignore", UserWarning)
            for name, contents in [*fixture, *extra]:
                archive.writestr(name, contents)
        return path

    def test_unambiguous_structure(self):
        path = self.archive([("base/root/", b""), ("base/root/test", b"data")])
        self.assertEqual(len(verifier.inspect_zip(path)), 4)

    def test_duplicate_case_collisions_and_traversal(self):
        for name in ["BundleConfig.pb", "BUNDLECONFIG.PB", "../outside", "base//a", "base/root//"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                verifier.inspect_zip(self.archive([(name, b"extra")]))

    def test_already_signed_and_expansion_ratio_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "signature metadata"):
            verifier.inspect_zip(self.archive([("META-INF/SIG-FOREIGN", b"untrusted")]))
        with self.assertRaisesRegex(ValueError, "expansion limits"):
            verifier.inspect_zip(self.archive([("base/root/compressed", b"a" * (256 * 1024))]))

    def test_trailing_data_is_rejected(self):
        bundle = self.archive()
        with bundle.open("ab") as stream:
            stream.write(b"trailing")
        with self.assertRaisesRegex(ValueError, "trailing data"):
            verifier.inspect_zip(bundle)

    def test_signed_content_excludes_only_the_expected_metadata(self):
        signed_metadata = [(name, b"fixture") for name in verifier.SIGNING_ENTRIES]
        unsigned = verifier.inspect_zip(self.archive())
        unchanged = verifier.inspect_zip(self.archive(signed_metadata), signed=True)
        modified = verifier.inspect_zip(self.archive([*signed_metadata, ("base/extra", b"test")]), signed=True)
        self.assertEqual(unchanged, unsigned)
        self.assertNotEqual(modified, unsigned)
        with self.assertRaises(ValueError):
            verifier.inspect_zip(self.archive([*signed_metadata, ("META-INF/OTHER.RSA", b"extra")]), signed=True)
