//! The relay's test client.

fn banner() -> String {
    format!("relay-cli ({})", relay_core::noise_pattern())
}

fn main() {
    println!("{}", banner());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn banner_names_the_pattern_from_core() {
        assert_eq!(banner(), format!("relay-cli ({})", relay_core::noise_pattern()));
    }
}
