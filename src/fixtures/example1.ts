import { withIds, type DiagramDoc } from '../model';
import { namedIcon } from '../icons';

/**
 * Ported from reference/ex1.py, but the connectors are relationships now
 * (kind: 'connector', from/to ids) rather than the reference's hand-placed
 * point lists. Every edge routes from current geometry via layout.ts, so
 * dragging an element re-anchors its connectors automatically. Element
 * positions still match the reference so the fixture reads familiar; the
 * paths are computed.
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
    { id: 'user', kind: 'actor', cx: 150, y: 112, label: 'User' },
    { id: 'my-varonis', kind: 'element', x: 700, y: 111, label: 'My Varonis', color: 'blue', icon: namedIcon('shield') },
    { id: 'okta', kind: 'element', x: 700, y: 173, label: 'Okta', color: 'gray', icon: namedIcon('lock') },
    { kind: 'connector', from: 'user', to: 'my-varonis', routing: 'straight',
      label: 'AUTHENTICATION', optional: 'https:443' },
    { kind: 'connector', from: 'my-varonis', to: 'okta', routing: 'straight' },

    // web path — WAF sits on the User → Web UI path
    { id: 'waf', kind: 'inlineControl', x: 495, y: 316, label: 'WAF', icon: namedIcon('shield') },
    { id: 'web-ui', kind: 'element', x: 465, y: 402, label: 'Web UI', color: 'blue', icon: namedIcon('monitor') },
    { kind: 'connector', from: 'user', to: 'waf', routing: 'elbow', label: 'HTTPS:443' },
    { kind: 'connector', from: 'waf', to: 'web-ui', routing: 'straight' },

    // backend and stores
    { id: 'saas-backend', kind: 'element', x: 450, y: 486, label: 'Varonis SaaS backend',
      size: 'lg', color: 'blue', icon: namedIcon('layers'), sub: '(DatAdvantage Cloud)' },
    { id: 'metadata-store', kind: 'element', x: 440, y: 680, label: 'Metadata store', icon: namedIcon('database') },
    { id: 'secret-store', kind: 'element', x: 610, y: 680, label: 'Secret store', icon: namedIcon('key') },
    { id: 'log-analytics', kind: 'element', x: 780, y: 680, label: 'Log analytics', icon: namedIcon('tune') },
    { kind: 'connector', from: 'web-ui', to: 'saas-backend', routing: 'straight' },
    { kind: 'connector', from: 'saas-backend', to: 'metadata-store', routing: 'straight' },
    { kind: 'connector', from: 'saas-backend', to: 'secret-store', routing: 'elbow' },
    { kind: 'connector', from: 'saas-backend', to: 'log-analytics', routing: 'elbow',
      label: 'LOGS & METRICS' },

    // customer-side integrations
    { id: 'data-sources', kind: 'grouped', x: 60, y: 428, label: 'Monitored data sources',
      children: [
        { label: 'SaaS applications', icon: namedIcon('cloud') },
        { label: 'IaaS platforms', icon: namedIcon('server') },
        { label: 'Identity providers', icon: namedIcon('key') },
      ],
    },
    { id: 'ticketing', kind: 'element', x: 60, y: 640, label: 'Ticketing integrations', size: 'md' },
    { id: 'siem-soar', kind: 'element', x: 60, y: 750, label: 'SIEM & SOAR integrations', size: 'md' },

    { kind: 'connector', from: 'saas-backend', to: 'data-sources', routing: 'straight',
      label: 'COLLECT DATA', optional: 'api' },
    { kind: 'connector', from: 'data-sources', to: 'saas-backend', routing: 'straight',
      label: 'REMEDIATION' },
    { kind: 'connector', from: 'saas-backend', to: 'ticketing', routing: 'elbow',
      label: 'TICKETS', optional: 'https:443' },
    { kind: 'connector', from: 'saas-backend', to: 'siem-soar', routing: 'elbow',
      label: 'EVENTS & ALERTS' },

    // azure
    { id: 'varonis-ai', kind: 'element', x: 990, y: 440, label: 'Varonis AI services',
      size: 'md', color: 'blue', icon: namedIcon('robot') },
    { id: 'aoai', kind: 'element', x: 990, y: 520, label: 'Azure OpenAI Service',
      size: 'md', color: 'gray', icon: namedIcon('cloud') },
    { kind: 'connector', from: 'saas-backend', to: 'varonis-ai', routing: 'elbow',
      label: 'GEN AI PROMPTS' },
    { kind: 'connector', from: 'varonis-ai', to: 'aoai', routing: 'straight' },

    { kind: 'legend', x: 1060, y: 700, encoding: 'Ownership',
      rows: [['blue', 'Varonis'], ['white', 'Customer'], ['gray', 'Third party']],
    },
    { kind: 'caption', x: 40, y: 872, text: '14 elements · 1 hue · 0 rotated labels' },
  ]),
};
