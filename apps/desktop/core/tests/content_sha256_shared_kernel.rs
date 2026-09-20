use bandscope_desktop_core::sha256_hex_reader;
use std::io::Cursor;

#[test]
fn shared_sha256_reader_matches_the_fips_180_4_abc_vector() {
    let digest = sha256_hex_reader(Cursor::new(b"abc"))
        .expect("in-memory FIPS 180-4 fixture should be readable");
    assert_eq!(
        digest,
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}
