//! The relay.

fn banner() -> String {
    format!("relay-server ({})", relay_core::noise_pattern())
}

fn main() {
    println!("{}", banner());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn banner_names_the_pattern_from_core() {
        assert_eq!(banner(), format!("relay-server ({})", relay_core::noise_pattern()));
    }
}
