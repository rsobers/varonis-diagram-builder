import { withIds, type DiagramDoc } from '../model';
import { namedIcon } from '../icons';

/**
 * Ported from reference/ex2.py. Order matches the Python source so the
 * emitted SVG layers stack the same way.
 */
export const example2: DiagramDoc = {
  version: 2,
  width: 1160,
  height: 930,
  title: [
    'Example 2 — Email security scanning pipeline',
    'Color encoding: State. Amber marks where untrusted content is handled.',
  ],
  items: withIds([
    { kind: 'boundary', x: 400, y: 386, w: 300, h: 128, label: 'Messaging cloud (MNET)' },
    { kind: 'boundary', x: 400, y: 580, w: 300, h: 258, label: 'Phishing sandbox (SNET)', tint: 'amber' },
    { kind: 'boundary', x: 50, y: 600, w: 250, h: 148, label: 'Threat intelligence (SREP)' },

    // mail path — every box shares centre line x=545
    { kind: 'element', x: 455, y: 82, label: 'Customer Exchange Online', size: 'lg', icon: namedIcon('mail') },
    { kind: 'element', x: 455, y: 250, label: 'Email security', size: 'lg', sub: '(CMS)', icon: namedIcon('shield') },
    { kind: 'actor', cx: 760, y: 280, label: 'User' },

    { kind: 'edge', points: [[500, 174], [500, 250]] },
    { kind: 'connectorLabel', cx: 500, cy: 212, text: 'NEW EMAIL\nNOTIFICATIONS' },
    { kind: 'edge', points: [[590, 250], [590, 174]] },
    { kind: 'connectorLabel', cx: 590, cy: 212, text: 'PULL EMAIL' },
    { kind: 'edge', points: [[744, 296], [635, 296]] },

    // MNET
    { kind: 'element', x: 470, y: 440, label: 'ML models', icon: namedIcon('robot') },
    { kind: 'edge', points: [[500, 342], [500, 440]] },
    { kind: 'connectorLabel', cx: 500, cy: 364, text: 'PULL EMAIL' },
    { kind: 'edge', points: [[590, 440], [590, 342]] },
    { kind: 'connectorLabel', cx: 590, cy: 364, text: 'PULL VERDICTS' },

    // SNET
    { kind: 'element', x: 470, y: 634, label: 'Virtual browsers', icon: namedIcon('monitor') },
    { kind: 'element', x: 470, y: 694, label: 'ML models', icon: namedIcon('robot') },
    { kind: 'element', x: 470, y: 754, label: 'Threat database', icon: namedIcon('database') },
    { kind: 'edge', points: [[545, 474], [545, 634]] },
    { kind: 'connectorLabel', cx: 545, cy: 554, text: 'LINKS & ATTACHMENTS\nFOR SCAN' },

    // SREP + OTI
    { kind: 'element', x: 70, y: 650, label: 'Threat database', sub: '(read-only)', size: 'md', icon: namedIcon('database') },
    { kind: 'element', x: 70, y: 426, label: 'On-demand threat intelligence', size: 'lg', icon: namedIcon('globe') },
    { kind: 'edge', points: [[160, 518], [160, 650]] },
    { kind: 'connectorLabel', cx: 160, cy: 584, text: 'PULL UPDATES' },
    { kind: 'edge', points: [[250, 662], [380, 662], [380, 457], [470, 457]] },
    { kind: 'connectorLabel', cx: 380, cy: 560, text: 'PULL THREATS' },
    { kind: 'edge', points: [[250, 702], [350, 702], [350, 771], [470, 771]] },
    { kind: 'connectorLabel', cx: 350, cy: 736, text: 'PULL THREATS' },
    { kind: 'edge', points: [[220, 426], [220, 296], [455, 296]] },
    { kind: 'connectorLabel', cx: 330, cy: 296, text: 'LINK FOR SCAN' },

    // egress
    { kind: 'element', x: 830, y: 440, label: 'Proxies', icon: namedIcon('tune') },
    { kind: 'element', x: 830, y: 560, label: 'Internet', color: 'amber', icon: namedIcon('globe') },
    { kind: 'edge', points: [[620, 457], [830, 457]] },
    { kind: 'connectorLabel', cx: 755, cy: 457, text: 'RESOLVE URLS' },
    { kind: 'edge', points: [[620, 651], [1030, 651], [1030, 457], [980, 457]] },
    { kind: 'connectorLabel', cx: 800, cy: 651, text: 'FETCH URLS' },
    { kind: 'edge', points: [[905, 474], [905, 560]] },

    {
      kind: 'legend', x: 70, y: 790, encoding: 'State',
      rows: [['amber', 'Handles untrusted content']],
    },
    { kind: 'caption', x: 40, y: 900, text: '9 elements · 1 hue · 0 rotated labels' },
  ]),
};
