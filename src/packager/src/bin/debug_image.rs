fn main() {
    let args: Vec<_> = std::env::args().collect();
    let data = std::fs::read(&args[1]).unwrap();
    let bmp = packager::rawbmp::Bmp::parse(&data).unwrap();
    println!("{:?}", bmp.header);
    println!("{:?}", bmp.dib_header);
    println!("{:?}", bmp.palette().collect::<Vec<_>>());
}
