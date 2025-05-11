import base64

def b64_to_hex(address: str) -> str:
    padded = address + "=" * (-len(address) % 4)
    decoded = base64.urlsafe_b64decode(padded)
    return decoded.hex()

b64_address = "UQCJN30zTneriQmB3YZIOFlNyfqx0dd2dVHIMkBiG2J7agUE"
hex_address = b64_to_hex(b64_address)
print("HEX-адрес:", hex_address)