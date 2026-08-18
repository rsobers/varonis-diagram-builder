import { withIds, type DiagramDoc } from '../model';
import { namedIcon } from '../icons';

/**
 * Two side-by-side deployment options for a Varonis SaaS integration.
 * Each side shows the same two-boundary layout (Customer Environment on top,
 * Varonis SaaS on bottom) with an Encrypted-connection inline control on
 * the path between them. Option 1 adds a Private Collector in the customer
 * environment; Option 2 goes SaaS-to-SaaS.
 *
 * Layout note: Grouped default width equals md/lg element width (180) per
 * §3.1/§3.2, so the stacked Element / Grouped shapes align on the same x.
 * Groups here that hold rows wider than 180 (e.g. "Automated Remediation"
 * with icon) auto-expand — the fixture keeps them centred so the wider
 * shell stays symmetric under the narrower element above.
 */
export const example3: DiagramDoc = {
  version: 2,
  width: 1090,
  height: 820,
  encoding: 'ownership',
  title: [
    'Example 3 — Private Collector vs SaaS-to-SaaS deployment',
    'Two side-by-side options for connecting a customer environment to Varonis SaaS.',
  ],
  items: withIds([
    // ---- Titles / captions per option ----
    { kind: 'title',   x: 90,  y: 110, text: 'Private Collector Deployment' },
    { kind: 'caption', x: 90,  y: 130, text: 'Option #1' },
    { kind: 'title',   x: 680, y: 110, text: 'SaaS-to-SaaS Deployment' },
    { kind: 'caption', x: 680, y: 130, text: 'Option #2' },

    // ---- Option 1: Private Collector ----
    { kind: 'boundary', x: 90,  y: 160, w: 370, h: 220, label: 'Customer Environment' },
    { kind: 'boundary', x: 90,  y: 540, w: 370, h: 240, label: 'Varonis SaaS' },

    // Elements aligned on x = 180 (width 180 each).
    { id: 'o1-data', kind: 'element', x: 180, y: 200, size: 'md',
      label: 'Customer Data Stores', icon: namedIcon('storage') },

    { id: 'o1-collector', kind: 'grouped', x: 180, y: 275, color: 'blue',
      label: 'Private Collector (k8s)',
      children: [{ label: 'Classification Engine', icon: namedIcon('dashboard') }],
    },

    { id: 'o1-encr', kind: 'inlineControl', x: 184, y: 410,
      label: 'Encrypted connection', icon: namedIcon('shield') },

    // Widened to fit "Automated Remediation" — offset x so its centre lines
    // up with the elements above.
    { id: 'o1-cloud', kind: 'grouped', x: 175, y: 590, color: 'blue',
      label: 'Varonis Cloud Platform',
      children: [
        { label: 'Automated Remediation', icon: namedIcon('settings') },
        { label: 'Forensics Layers', icon: namedIcon('layers') },
      ],
    },

    { kind: 'connector', from: 'o1-data', to: 'o1-collector', routing: 'straight' },
    { kind: 'connector', from: 'o1-collector', to: 'o1-encr', routing: 'straight', arrows: 'none' },
    { kind: 'connector', from: 'o1-encr', to: 'o1-cloud', routing: 'straight',
      label: 'METADATA & LOGS' },

    // ---- Option 2: SaaS-to-SaaS ----
    { kind: 'boundary', x: 680, y: 160, w: 370, h: 220, label: 'Customer Environment' },
    { kind: 'boundary', x: 680, y: 540, w: 370, h: 240, label: 'Varonis SaaS' },

    { id: 'o2-data', kind: 'element', x: 770, y: 240, size: 'md',
      label: 'Customer Data Stores', icon: namedIcon('storage') },

    { id: 'o2-encr', kind: 'inlineControl', x: 774, y: 410,
      label: 'Encrypted connection', icon: namedIcon('shield') },

    // Widened to fit "High-Volume Classification Engine" — offset x so its
    // centre matches the elements above.
    { id: 'o2-cloud', kind: 'grouped', x: 734, y: 590, color: 'blue',
      label: 'Varonis Cloud Platform',
      children: [
        { label: 'High-Volume Classification Engine', icon: namedIcon('search') },
        { label: 'Automated Remediation', icon: namedIcon('settings') },
        { label: 'Forensics Layers', icon: namedIcon('layers') },
      ],
    },

    { kind: 'connector', from: 'o2-data', to: 'o2-encr', routing: 'straight', arrows: 'none' },
    { kind: 'connector', from: 'o2-encr', to: 'o2-cloud', routing: 'straight' },

    // Shared legend at the bottom middle.
    { kind: 'legend', x: 490, y: 720, encoding: 'Ownership',
      rows: [['blue', 'Varonis-operated'], ['white', 'Customer-operated']],
    },
  ]),
};
