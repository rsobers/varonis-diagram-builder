import { withIds, type DiagramDoc } from '../model';
import { namedIcon } from '../icons';

/**
 * Two side-by-side deployment options for a Varonis SaaS integration.
 * Each side shows the same two-boundary layout (Customer Environment on top,
 * Varonis SaaS on bottom) with an Encrypted-connection inline control on
 * the path between them. Option 1 adds a Private Collector in the customer
 * environment; Option 2 goes SaaS-to-SaaS.
 */
export const example3: DiagramDoc = {
  version: 2,
  width: 1090,
  height: 780,
  encoding: 'ownership',
  title: [
    'Example 3 — Private Collector vs SaaS-to-SaaS deployment',
    'Two side-by-side options for connecting a customer environment to Varonis SaaS.',
  ],
  items: withIds([
    // ---- Titles / captions per option ----
    { kind: 'title',   x: 90,  y: 70, text: 'Private Collector Deployment' },
    { kind: 'caption', x: 90,  y: 90, text: 'Option #1' },
    { kind: 'title',   x: 680, y: 70, text: 'SaaS-to-SaaS Deployment' },
    { kind: 'caption', x: 680, y: 90, text: 'Option #2' },

    // ---- Option 1: Private Collector ----
    { kind: 'boundary', x: 90,  y: 120, w: 370, h: 220, label: 'Customer Environment' },
    { kind: 'boundary', x: 90,  y: 500, w: 370, h: 240, label: 'Varonis SaaS' },

    { id: 'o1-data', kind: 'element', x: 180, y: 160, size: 'md',
      label: 'Customer Data Stores', icon: namedIcon('storage') },

    { id: 'o1-collector', kind: 'grouped', x: 174, y: 235, color: 'blue',
      label: 'Private Collector (k8s)',
      children: [{ label: 'Classification Engine', icon: namedIcon('dashboard') }],
    },

    { id: 'o1-encr', kind: 'inlineControl', x: 179, y: 370,
      label: 'Encrypted connection', icon: namedIcon('shield') },

    { id: 'o1-cloud', kind: 'grouped', x: 170, y: 550, color: 'blue',
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
    { kind: 'boundary', x: 680, y: 120, w: 370, h: 220, label: 'Customer Environment' },
    { kind: 'boundary', x: 680, y: 500, w: 370, h: 240, label: 'Varonis SaaS' },

    { id: 'o2-data', kind: 'element', x: 760, y: 200, size: 'md',
      label: 'Customer Data Stores', icon: namedIcon('storage') },

    { id: 'o2-encr', kind: 'inlineControl', x: 770, y: 370,
      label: 'Encrypted connection', icon: namedIcon('shield') },

    { id: 'o2-cloud', kind: 'grouped', x: 730, y: 550, color: 'blue',
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
    { kind: 'legend', x: 490, y: 680, encoding: 'Ownership',
      rows: [['blue', 'Varonis-operated'], ['white', 'Customer-operated']],
    },
  ]),
};
