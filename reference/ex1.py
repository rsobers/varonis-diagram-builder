from v2 import Diagram

d = Diagram(1290, 900, ("Example 1 — Varonis SaaS platform architecture",
                        "Color encoding: Ownership. Firewall perimeter is a Zone Divider; WAF is an Inline Control."))

d.zone_divider(392, 84, 838, "Customer perimeter")
d.boundary(420, 372, 530, 456, "Varonis cloud account (AWS)", label_side="right")
d.boundary(966, 405, 250, 205, "Azure")

# actors and identity
d.actor(150, 112, "User")
d.element(700, 111, "My Varonis", color="blue", ic="shield")
d.element(700, 173, "Okta", color="gray", ic="lock")
d.edge([(168, 128), (700, 128)])
d.clabel(455, 128, "AUTHENTICATION", optional="https:443")
d.edge([(620, 128), (620, 190), (700, 190)])

# web path
d.edge([(150, 178), (150, 300), (540, 300), (540, 316)])
d.clabel(300, 300, "HTTPS:443")
d.inline_control(495, 316, "WAF", ic="shield")
d.edge([(540, 352), (540, 402)])
d.element(465, 402, "Web UI", color="blue", ic="monitor")
d.edge([(540, 436), (540, 486)])

# backend and stores
d.element(450, 486, "Varonis SaaS backend", size="lg", color="blue", ic="layers", sub="(DatAdvantage Cloud)")
d.element(440, 680, "Metadata store", ic="database")
d.element(610, 680, "Secret store", ic="key")
d.element(780, 680, "Log analytics", ic="tune")
d.edge([(515, 578), (515, 680)])
d.edge([(575, 578), (575, 640), (685, 640), (685, 680)])
d.edge([(630, 552), (855, 552), (855, 680)])
d.clabel(760, 552, "LOGS & METRICS")

# customer-side integrations
d.grouped(60, 428, "Monitored data sources", [
    ("SaaS applications", "cloud"),
    ("IaaS platforms", "server"),
    ("Identity providers", "key")])
d.element(60, 640, "Ticketing integrations", size="md")
d.element(60, 750, "SIEM & SOAR integrations", size="md")

d.edge([(450, 496), (250, 496)])
d.clabel(350, 496, "COLLECT DATA", optional="api")
d.edge([(250, 522), (450, 522)])
d.clabel(350, 522, "REMEDIATION")
d.edge([(450, 548), (390, 548), (390, 672), (240, 672)])
d.clabel(315, 672, "TICKETS", optional="https:443")
d.edge([(450, 572), (345, 572), (345, 782), (240, 782)])
d.clabel(300, 782, "EVENTS & ALERTS")

# azure
d.element(990, 440, "Varonis AI services", size="md", color="blue", ic="robot")
d.element(990, 520, "Azure OpenAI Service", size="md", color="gray", ic="cloud")
d.edge([(630, 512), (880, 512), (880, 472), (990, 472)])
d.clabel(770, 512, "GEN AI PROMPTS")
d.edge([(1080, 504), (1080, 520)])

d.legend(1060, 700, "Ownership", [("blue", "Varonis"), ("white", "Customer"), ("gray", "Third party")])
d.caption(40, 872, "14 elements · 1 hue · 0 rotated labels")
d.save('../docs/example-1-v2.svg')
print('ok')
