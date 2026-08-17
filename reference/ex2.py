from v2 import Diagram

d = Diagram(1160, 930, ("Example 2 — Email security scanning pipeline",
                        "Color encoding: State. Amber marks where untrusted content is handled."))

d.boundary(400, 386, 300, 128, "Messaging cloud (MNET)", filled=True)
d.boundary(400, 580, 300, 258, "Phishing sandbox (SNET)", tint="amber")
d.boundary(50, 600, 250, 148, "Threat intelligence (SREP)", filled=True)

# mail path — every box shares centre line x=545
d.element(455, 82, "Customer Exchange Online", size="lg", ic="mail")
d.element(455, 250, "Email security", size="lg", sub="(CMS)", ic="shield")
d.actor(760, 280, "User")

d.edge([(500, 174), (500, 250)])
d.clabel(500, 212, "NEW EMAIL\nNOTIFICATIONS")
d.edge([(590, 250), (590, 174)])
d.clabel(590, 212, "PULL EMAIL")
d.edge([(744, 296), (635, 296)])

# MNET
d.element(470, 440, "ML models", ic="robot")
d.edge([(500, 342), (500, 440)])
d.clabel(500, 364, "PULL EMAIL")
d.edge([(590, 440), (590, 342)])
d.clabel(590, 364, "PULL VERDICTS")

# SNET
d.element(470, 634, "Virtual browsers", ic="monitor")
d.element(470, 694, "ML models", ic="robot")
d.element(470, 754, "Threat database", ic="database")
d.edge([(545, 474), (545, 634)])
d.clabel(545, 554, "LINKS & ATTACHMENTS\nFOR SCAN")

# SREP + OTI
d.element(70, 650, "Threat database", sub="(read-only)", size="md", ic="database")
d.element(70, 426, "On-demand threat intelligence", size="lg", ic="globe")
d.edge([(160, 518), (160, 650)])
d.clabel(160, 584, "PULL UPDATES")
d.edge([(250, 662), (380, 662), (380, 457), (470, 457)])
d.clabel(380, 560, "PULL THREATS")
d.edge([(250, 702), (350, 702), (350, 771), (470, 771)])
d.clabel(350, 736, "PULL THREATS")
d.edge([(220, 426), (220, 296), (455, 296)])
d.clabel(330, 296, "LINK FOR SCAN")

# egress
d.element(830, 440, "Proxies", ic="tune")
d.element(830, 560, "Internet", color="amber", ic="globe")
d.edge([(620, 457), (830, 457)])
d.clabel(755, 457, "RESOLVE URLS")
d.edge([(620, 651), (1030, 651), (1030, 457), (980, 457)])
d.clabel(800, 651, "FETCH URLS")
d.edge([(905, 474), (905, 560)])

d.legend(70, 790, "State", [("amber", "Handles untrusted content")])
d.caption(40, 900, "9 elements · 1 hue · 0 rotated labels")
d.save('../docs/example-2-v2.svg')
print('ok')
