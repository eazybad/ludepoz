from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


OUT = Path("docs/KAMPASIKA_Product_Walkthrough_Groups_and_Rooms.pptx")
EMU_PER_INCH = 914400
SLIDE_W = 13.333
SLIDE_H = 7.5


def emu(value):
    return int(value * EMU_PER_INCH)


def color(hex_value):
    return hex_value.replace("#", "").upper()


def paragraph(text, size=24, bold=False, fill="0F1B2D", bullet=False):
    mar_l = ' marL="342900" indent="-171450"' if bullet else ""
    bu = '<a:buChar char="•"/>' if bullet else "<a:buNone/>"
    return f"""
      <a:p>
        <a:pPr{mar_l}>{bu}</a:pPr>
        <a:r>
          <a:rPr lang="en-US" sz="{int(size * 100)}"{' b="1"' if bold else ''}>
            <a:solidFill><a:srgbClr val="{color(fill)}"/></a:solidFill>
          </a:rPr>
          <a:t>{escape(text)}</a:t>
        </a:r>
        <a:endParaRPr lang="en-US" sz="{int(size * 100)}"/>
      </a:p>
    """


def shape_text(shape_id, x, y, w, h, lines, font_size=22, fill="0F1B2D", bold=False, align="l"):
    if isinstance(lines, str):
        lines = [lines]
    paras = []
    for idx, line in enumerate(lines):
        if isinstance(line, tuple):
            text, size, is_bold, text_fill, is_bullet = line
            paras.append(paragraph(text, size, is_bold, text_fill, is_bullet))
        else:
            paras.append(paragraph(line, font_size, bold if idx == 0 else False, fill, False))
    return f"""
    <p:sp>
      <p:nvSpPr><p:cNvPr id="{shape_id}" name="Text {shape_id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" anchor="t"/>
        <a:lstStyle/>
        {''.join(paras)}
      </p:txBody>
    </p:sp>
    """


def rect(shape_id, x, y, w, h, fill, line=None, radius=False):
    prst = "roundRect" if radius else "rect"
    ln = f'<a:ln w="12700"><a:solidFill><a:srgbClr val="{color(line)}"/></a:solidFill></a:ln>' if line else "<a:ln><a:noFill/></a:ln>"
    return f"""
    <p:sp>
      <p:nvSpPr><p:cNvPr id="{shape_id}" name="Shape {shape_id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>
        <a:prstGeom prst="{prst}"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="{color(fill)}"/></a:solidFill>
        {ln}
      </p:spPr>
    </p:sp>
    """


def line(shape_id, x1, y1, x2, y2, fill="0D9488", width=2):
    return f"""
    <p:cxnSp>
      <p:nvCxnSpPr><p:cNvPr id="{shape_id}" name="Line {shape_id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>
      <p:spPr>
        <a:xfrm><a:off x="{emu(min(x1, x2))}" y="{emu(min(y1, y2))}"/><a:ext cx="{emu(abs(x2-x1))}" cy="{emu(abs(y2-y1))}"/></a:xfrm>
        <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
        <a:ln w="{int(width * 12700)}"><a:solidFill><a:srgbClr val="{color(fill)}"/></a:solidFill></a:ln>
      </p:spPr>
    </p:cxnSp>
    """


def title_slide(title, subtitle, kicker="KAMPASIKA"):
    return [
        rect(2, 0, 0, SLIDE_W, SLIDE_H, "F7FAFC"),
        rect(3, 0, 0, SLIDE_W, 1.05, "0F1B2D"),
        shape_text(4, 0.75, 0.28, 4, 0.4, kicker, 16, "06D6C7", True),
        shape_text(5, 0.75, 2.0, 8.7, 1.2, title, 42, "0F1B2D", True),
        shape_text(6, 0.82, 3.25, 6.8, 0.8, subtitle, 22, "486171", False),
        rect(7, 8.35, 2.0, 3.7, 3.1, "0D9488", radius=True),
        shape_text(8, 8.72, 2.38, 3.0, 0.45, "Campus groups", 22, "FFFFFF", True),
        shape_text(9, 8.72, 2.95, 2.9, 1.35, [
            ("Money", 18, True, "FFFFFF", True),
            ("Events", 18, True, "FFFFFF", True),
            ("Files", 18, True, "FFFFFF", True),
            ("Members", 18, True, "FFFFFF", True),
        ]),
        shape_text(10, 0.82, 6.8, 4.2, 0.3, "Groups coordination + rooms discovery", 13, "667085"),
    ]


def bullets_slide(title, bullets, accent="0D9488"):
    shapes = [
        rect(2, 0, 0, SLIDE_W, SLIDE_H, "F7FAFC"),
        shape_text(3, 0.65, 0.42, 9.0, 0.55, title, 28, "0F1B2D", True),
        rect(4, 0.65, 1.15, 1.3, 0.08, accent),
    ]
    y = 1.55
    for idx, (head, body) in enumerate(bullets):
        shapes.append(rect(10 + idx * 3, 0.8, y, 11.7, 0.72, "FFFFFF", "E2E8F0", True))
        shapes.append(shape_text(11 + idx * 3, 1.08, y + 0.14, 3.0, 0.3, head, 17, accent, True))
        shapes.append(shape_text(12 + idx * 3, 3.55, y + 0.14, 8.4, 0.35, body, 15, "344054"))
        y += 0.86
    return shapes


def flow_slide(title, steps):
    shapes = [
        rect(2, 0, 0, SLIDE_W, SLIDE_H, "F7FAFC"),
        shape_text(3, 0.65, 0.42, 10.0, 0.55, title, 28, "0F1B2D", True),
    ]
    start_x = 0.9
    y = 2.25
    box_w = 2.25
    gap = 0.3
    for idx, step in enumerate(steps):
        x = start_x + idx * (box_w + gap)
        shapes.append(rect(10 + idx, x, y, box_w, 1.55, "FFFFFF", "BFEFEB", True))
        shapes.append(shape_text(20 + idx, x + 0.18, y + 0.18, 0.55, 0.35, str(idx + 1), 18, "0D9488", True))
        shapes.append(shape_text(30 + idx, x + 0.18, y + 0.58, box_w - 0.36, 0.65, step, 16, "0F1B2D", True))
        if idx < len(steps) - 1:
            shapes.append(line(40 + idx, x + box_w, y + 0.78, x + box_w + gap, y + 0.78, "06D6C7", 2))
    return shapes


def two_column_slide(title, left_title, left_bullets, right_title, right_bullets):
    shapes = [
        rect(2, 0, 0, SLIDE_W, SLIDE_H, "F7FAFC"),
        shape_text(3, 0.65, 0.42, 10.0, 0.55, title, 28, "0F1B2D", True),
        rect(4, 0.78, 1.45, 5.75, 4.9, "FFFFFF", "E2E8F0", True),
        rect(5, 6.8, 1.45, 5.75, 4.9, "FFFFFF", "E2E8F0", True),
        shape_text(6, 1.12, 1.78, 4.7, 0.4, left_title, 21, "0D9488", True),
        shape_text(7, 7.14, 1.78, 4.7, 0.4, right_title, 21, "0D9488", True),
    ]
    for i, b in enumerate(left_bullets):
        shapes.append(shape_text(20 + i, 1.15, 2.35 + i * 0.55, 4.7, 0.35, [(b, 15, False, "344054", True)]))
    for i, b in enumerate(right_bullets):
        shapes.append(shape_text(40 + i, 7.17, 2.35 + i * 0.55, 4.7, 0.35, [(b, 15, False, "344054", True)]))
    return shapes


SLIDES = [
    title_slide(
        "KAMPASIKA: campus groups that coordinate better than WhatsApp",
        "A student-first app for group money, events, files, members, and room discovery.",
    ),
    bullets_slide("The Problem On Campus", [
        ("Group chats get noisy", "Important payment, event, and file updates disappear inside long chats."),
        ("Money is hard to track", "Admins need to know who registered, who paid, and who is still pending."),
        ("Files scatter everywhere", "Resources live in WhatsApp, Google Drive, screenshots, and old messages."),
        ("Rooms need trust", "Students need clearer room information, photos, price, location, and landlord contact."),
    ]),
    flow_slide("Core Group Coordination Flow", [
        "Create or join a campus group",
        "Post updates and resources",
        "Create event or contribution",
        "Members register or submit proof",
        "Admin tracks progress",
    ]),
    two_column_slide(
        "Groups: What Members See vs What Admins Manage",
        "Members",
        ["Announcements", "Events and registrations", "Payment status", "Files and folders", "Group members"],
        "Admins / Owners",
        ["Create collections", "Verify payment proof", "See member details", "Remove or block members", "Start new rounds"],
    ),
    bullets_slide("Money Coordination", [
        ("Collections", "Create contribution, order, or paid event with amount and deadline."),
        ("Payment status", "Members see their own status; admins see registered, pending, and paid people."),
        ("Proof first", "Manual proof remains available while live mobile money is marked coming soon."),
        ("History remains", "Old rounds remain for creator/admin while new rounds start clean for members."),
    ], "0F766E"),
    bullets_slide("Events, Files, And Members", [
        ("Events", "Paid or free events can collect registrations and show who is attending."),
        ("Files", "Folders keep notes, PDFs, and resources organized by group context."),
        ("Members", "Users are shown by username first; phone details are reserved for admin action."),
        ("Offline feel", "Known/discovered content can remain visible, while online actions wait for connection."),
    ], "0F766E"),
    bullets_slide("Discover Focus: Rooms Only For Now", [
        ("Simple supply focus", "Discover should not feel empty by spreading attention across too many categories."),
        ("Room cards", "Show location, price, room type, amenities, and photos clearly."),
        ("Indoor photo swipe", "Students can inspect room images by swiping through photos."),
        ("Admin switch", "Rooms can stay hidden until there is enough supply to make the feed useful."),
    ], "0D9488"),
    flow_slide("Room Discovery Flow", [
        "Landlord/student lists room",
        "Adds photos and location",
        "Student browses rooms",
        "Student checks indoor view",
        "Student contacts landlord",
    ]),
    two_column_slide(
        "Why This MVP Can Work",
        "Strong wedge",
        ["Groups already exist", "Money coordination is painful", "Admins need structure", "Students understand WhatsApp-like flows"],
        "Focused launch",
        ["Start with real groups", "Keep payments proof-based", "Keep Discover rooms-only", "Add split bills after payment setup"],
    ),
    bullets_slide("Next Product Priorities", [
        ("1. Polish group payments", "Make collection cards and status pages cleaner and more reassuring."),
        ("2. Test with real students", "Watch where they hesitate: joining, registering, paying, or finding details."),
        ("3. Prepare live payments", "Keep mobile money marked coming soon until registration/API approval is ready."),
        ("4. Build room supply", "Only open rooms broadly when enough listings exist to make Discover useful."),
    ], "0F1B2D"),
]


def slide_xml(shapes):
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      {''.join(shapes)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""


def content_types(num_slides):
    slide_overrides = "\n".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, num_slides + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  {slide_overrides}
</Types>"""


def presentation_xml(num_slides):
    sld_ids = "\n".join(f'<p:sldId id="{255+i}" r:id="rId{i}"/>' for i in range(1, num_slides + 1))
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId{num_slides + 1}"/></p:sldMasterIdLst>
  <p:sldIdLst>{sld_ids}</p:sldIdLst>
  <p:sldSz cx="{emu(SLIDE_W)}" cy="{emu(SLIDE_H)}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>"""


def presentation_rels(num_slides):
    rels = "\n".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>'
        for i in range(1, num_slides + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {rels}
  <Relationship Id="rId{num_slides + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId{num_slides + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId{num_slides + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
  <Relationship Id="rId{num_slides + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
  <Relationship Id="rId{num_slides + 5}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>
</Relationships>"""


ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""


SLIDE_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>"""


MASTER_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>"""


MASTER_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>"""


LAYOUT_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>"""


LAYOUT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>"""


THEME_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Kampasika">
  <a:themeElements>
    <a:clrScheme name="Kampasika">
      <a:dk1><a:srgbClr val="0F1B2D"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="344054"/></a:dk2><a:lt2><a:srgbClr val="F7FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="06D6C7"/></a:accent1><a:accent2><a:srgbClr val="0D9488"/></a:accent2>
      <a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="EF4444"/></a:accent4>
      <a:accent5><a:srgbClr val="667085"/></a:accent5><a:accent6><a:srgbClr val="0F766E"/></a:accent6>
      <a:hlink><a:srgbClr val="0D9488"/></a:hlink><a:folHlink><a:srgbClr val="0F766E"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Aptos"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Kampasika"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>"""


def write():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    app_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>{len(SLIDES)}</Slides>
</Properties>"""
    core_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>KAMPASIKA Product Walkthrough</dc:title><dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>"""
    with ZipFile(OUT, "w", ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types(len(SLIDES)))
        z.writestr("_rels/.rels", ROOT_RELS)
        z.writestr("docProps/app.xml", app_xml)
        z.writestr("docProps/core.xml", core_xml)
        z.writestr("ppt/presentation.xml", presentation_xml(len(SLIDES)))
        z.writestr("ppt/_rels/presentation.xml.rels", presentation_rels(len(SLIDES)))
        z.writestr("ppt/slideMasters/slideMaster1.xml", MASTER_XML)
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", MASTER_RELS)
        z.writestr("ppt/slideLayouts/slideLayout1.xml", LAYOUT_XML)
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", LAYOUT_RELS)
        z.writestr("ppt/theme/theme1.xml", THEME_XML)
        z.writestr("ppt/presProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
        z.writestr("ppt/viewProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
        z.writestr("ppt/tableStyles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>')
        for idx, shapes in enumerate(SLIDES, start=1):
            z.writestr(f"ppt/slides/slide{idx}.xml", slide_xml(shapes))
            z.writestr(f"ppt/slides/_rels/slide{idx}.xml.rels", SLIDE_RELS)
    print(OUT.resolve())


if __name__ == "__main__":
    write()
