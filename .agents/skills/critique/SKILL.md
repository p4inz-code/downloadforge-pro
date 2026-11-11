---
name: critique
description: Adversarial review of UX friction, edge cases, error recovery, network dropouts, rate-limiting, and architecture flaws.
---

# Critique Skill

## Protocol
1. **Challenge Assumptions**: Assume worst-case network environments (packet loss, 403 CDN hotlink checks, rate-limiting tokens).
2. **Edge Case Hunting**:
   - Single-use URLs with 60-second expiration tokens.
   - Separate DASH tracks (1080p video without audio).
   - Encrypted MSE blobs with dynamic chunk IDs.
   - User closing origin tab while Studio is downloading.
3. **Friction Elimination**: Flag unnecessary clicks, hidden error messages, or confusing labels.
