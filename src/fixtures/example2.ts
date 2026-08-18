import { withIds, type DiagramDoc } from '../model';
import { namedIcon } from '../icons';

/**
 * Ported from reference/ex2.py — same shape as example1: element positions
 * are preserved, connectors are relationships (kind: 'connector', from/to)
 * rather than the reference's hand-placed point lists.
 */
export const example2: DiagramDoc = {
  version: 2,
  width: 1160,
  height: 930,
  encoding: 'state',
  title: [
    'Example 2 — Email security scanning pipeline',
    'Color encoding: State. Amber marks where untrusted content is handled.',
  ],
  items: withIds([
    { kind: 'boundary', x: 400, y: 386, w: 300, h: 128, label: 'Messaging cloud (MNET)' },
    { kind: 'boundary', x: 400, y: 580, w: 300, h: 258, label: 'Phishing sandbox (SNET)', tint: 'amber' },
    { kind: 'boundary', x: 50, y: 600, w: 250, h: 148, label: 'Threat intelligence (SREP)' },

    // mail path
    { id: 'exchange', kind: 'element', x: 455, y: 82, label: 'Customer Exchange Online',
      size: 'lg', icon: namedIcon('mail') },
    { id: 'email-security', kind: 'element', x: 455, y: 250, label: 'Email security',
      size: 'lg', sub: '(CMS)', icon: namedIcon('shield') },
    { id: 'user', kind: 'actor', cx: 760, y: 280, label: 'User' },

    { kind: 'connector', from: 'exchange', to: 'email-security', routing: 'straight',
      label: 'NEW EMAIL\nNOTIFICATIONS', labelOffset: 0.447 },
    { kind: 'connector', from: 'email-security', to: 'exchange', routing: 'straight',
      label: 'PULL EMAIL', labelOffset: 0.528 },
    { kind: 'connector', from: 'user', to: 'email-security', routing: 'straight' },

    // MNET
    { id: 'ml-mnet', kind: 'element', x: 470, y: 440, label: 'ML models', icon: namedIcon('robot') },
    { kind: 'connector', from: 'email-security', to: 'ml-mnet', routing: 'straight',
      label: 'PULL EMAIL', labelOffset: 0.243 },
    { kind: 'connector', from: 'ml-mnet', to: 'email-security', routing: 'straight',
      label: 'PULL VERDICTS', labelOffset: 0.758 },

    // SNET
    { id: 'virtual-browsers', kind: 'element', x: 470, y: 634, label: 'Virtual browsers', icon: namedIcon('monitor') },
    { id: 'ml-snet', kind: 'element', x: 470, y: 694, label: 'ML models', icon: namedIcon('robot') },
    { id: 'threat-db-snet', kind: 'element', x: 470, y: 754, label: 'Threat database', icon: namedIcon('database') },
    { kind: 'connector', from: 'ml-mnet', to: 'virtual-browsers', routing: 'straight',
      label: 'LINKS & ATTACHMENTS\nFOR SCAN', labelOffset: 0.439 },

    // SREP + OTI
    { id: 'threat-db-srep', kind: 'element', x: 70, y: 650, label: 'Threat database',
      sub: '(read-only)', size: 'md', icon: namedIcon('database') },
    { id: 'oti', kind: 'element', x: 70, y: 426, label: 'On-demand threat intelligence',
      size: 'lg', icon: namedIcon('globe') },
    { kind: 'connector', from: 'oti', to: 'threat-db-srep', routing: 'straight',
      label: 'PULL UPDATES', labelOffset: 0.321 },
    { kind: 'connector', from: 'threat-db-srep', to: 'ml-mnet', routing: 'elbow',
      label: 'PULL THREATS' },
    { kind: 'connector', from: 'threat-db-srep', to: 'threat-db-snet', routing: 'elbow',
      label: 'PULL THREATS', labelOffset: 0.341 },
    { kind: 'connector', from: 'oti', to: 'email-security', routing: 'elbow',
      label: 'LINK FOR SCAN', labelOffset: 0.541 },

    // egress
    { id: 'proxies', kind: 'element', x: 830, y: 440, label: 'Proxies', icon: namedIcon('tune') },
    { id: 'internet', kind: 'element', x: 830, y: 560, label: 'Internet',
      color: 'amber', icon: namedIcon('globe') },
    { kind: 'connector', from: 'ml-mnet', to: 'proxies', routing: 'straight',
      label: 'RESOLVE URLS' },
    { kind: 'connector', from: 'virtual-browsers', to: 'proxies', routing: 'elbow',
      label: 'FETCH URLS', labelOffset: 0.539 },
    { kind: 'connector', from: 'proxies', to: 'internet', routing: 'straight' },

    { kind: 'legend', x: 70, y: 790, encoding: 'State',
      rows: [['amber', 'Handles untrusted content']],
    },
    { kind: 'caption', x: 40, y: 900, text: '9 elements · 1 hue · 0 rotated labels' },
  ]),
};
