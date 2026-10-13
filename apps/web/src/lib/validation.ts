import { z } from 'zod';
// Disable Zod's optional Function-based optimizer before the Mera schemas load.
// It otherwise probes eval, which a strict browser CSP correctly reports/blocks.
z.config({ jitless: true });
