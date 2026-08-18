import { withIds, type DiagramDoc } from '../model';
import { namedIcon } from '../icons';

/**
 * Ported from reference/ex1.py. Preserves coordinates and item order so the
 * SVG output layers match the Python oracle's layer order (boundaries → edges
 * → boundary labels → nodes → labels).
 */
export const example1: DiagramDoc = {
  version: 2,
  width: 1290,
  height: 900,
  encoding: 'ownership',
  title: [
    'Example 1 — Varonis SaaS platform architecture',
    'Color encoding: Ownership. Firewall perimeter is a Zone Divider; WAF is an Inline Control.',
  ],
  items: withIds([
    { kind: 'zoneDivider', x: 392, y1: 84, y2: 838, label: 'Customer perimeter' },
    { kind: 'boundary', x: 420, y: 372, w: 530, h: 456, label: 'Varonis cloud account (AWS)', labelSide: 'right' },
    { kind: 'boundary', x: 966, y: 405, w: 250, h: 205, label: 'Azure' },

    // actors and identity
    { kind: 'actor', cx: 150, y: 112, label: 'User' },
    { kind: 'element', x: 700, y: 111, label: 'My Varonis', color: 'blue', icon: namedIcon('shield') },
    { kind: 'element', x: 700, y: 173, label: 'Okta', color: 'gray', icon: namedIcon('lock') },
    { kind: 'edge', points: [[168, 128], [700, 128]] },
    { kind: 'connectorLabel', cx: 455, cy: 128, text: 'AUTHENTICATION', optional: 'https:443' },
    { kind: 'edge', points: [[620, 128], [620, 190], [700, 190]] },

    // web path
    { kind: 'edge', points: [[150, 178], [150, 300], [540, 300], [540, 316]] },
    { kind: 'connectorLabel', cx: 300, cy: 300, text: 'HTTPS:443' },
    { kind: 'inlineControl', x: 495, y: 316, label: 'WAF', icon: namedIcon('shield') },
    { kind: 'edge', points: [[540, 352], [540, 402]] },
    { kind: 'element', x: 465, y: 402, label: 'Web UI', color: 'blue', icon: namedIcon('monitor') },
    { kind: 'edge', points: [[540, 436], [540, 486]] },

    // backend and stores
    { kind: 'element', x: 450, y: 486, label: 'Varonis SaaS backend', size: 'lg', color: 'blue', icon: namedIcon('layers'), sub: '(DatAdvantage Cloud)' },
    { kind: 'element', x: 440, y: 680, label: 'Metadata store', icon: namedIcon('database') },
    { kind: 'element', x: 610, y: 680, label: 'Secret store', icon: namedIcon('key') },
    { kind: 'element', x: 780, y: 680, label: 'Log analytics', icon: namedIcon('tune') },
    { kind: 'edge', points: [[515, 578], [515, 680]] },
    { kind: 'edge', points: [[575, 578], [575, 640], [685, 640], [685, 680]] },
    { kind: 'edge', points: [[630, 552], [855, 552], [855, 680]] },
    { kind: 'connectorLabel', cx: 760, cy: 552, text: 'LOGS & METRICS' },

    // customer-side integrations
    {
      kind: 'grouped', x: 60, y: 428, label: 'Monitored data sources',
      children: [
        { label: 'SaaS applications', icon: namedIcon('cloud') },
        { label: 'IaaS platforms', icon: namedIcon('server') },
        { label: 'Identity providers', icon: namedIcon('key') },
      ],
    },
    { kind: 'element', x: 60, y: 640, label: 'Ticketing integrations', size: 'md' },
    { kind: 'element', x: 60, y: 750, label: 'SIEM & SOAR integrations', size: 'md' },

    { kind: 'edge', points: [[450, 496], [250, 496]] },
    { kind: 'connectorLabel', cx: 350, cy: 496, text: 'COLLECT DATA', optional: 'api' },
    { kind: 'edge', points: [[250, 522], [450, 522]] },
    { kind: 'connectorLabel', cx: 350, cy: 522, text: 'REMEDIATION' },
    { kind: 'edge', points: [[450, 548], [390, 548], [390, 672], [240, 672]] },
    { kind: 'connectorLabel', cx: 315, cy: 672, text: 'TICKETS', optional: 'https:443' },
    { kind: 'edge', points: [[450, 572], [345, 572], [345, 782], [240, 782]] },
    { kind: 'connectorLabel', cx: 300, cy: 782, text: 'EVENTS & ALERTS' },

    // azure
    { kind: 'element', x: 990, y: 440, label: 'Varonis AI services', size: 'md', color: 'blue', icon: namedIcon('robot') },
    { kind: 'element', x: 990, y: 520, label: 'Azure OpenAI Service', size: 'md', color: 'gray', icon: namedIcon('cloud') },
    { kind: 'edge', points: [[630, 512], [880, 512], [880, 472], [990, 472]] },
    { kind: 'connectorLabel', cx: 770, cy: 512, text: 'GEN AI PROMPTS' },
    { kind: 'edge', points: [[1080, 504], [1080, 520]] },

    {
      kind: 'legend', x: 1060, y: 700, encoding: 'Ownership',
      rows: [['blue', 'Varonis'], ['white', 'Customer'], ['gray', 'Third party']],
    },
    { kind: 'caption', x: 40, y: 872, text: '14 elements · 1 hue · 0 rotated labels' },
  ]),
};
