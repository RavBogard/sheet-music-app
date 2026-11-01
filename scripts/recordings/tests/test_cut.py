import cut
from cut import Block


def _b(start, end, text="", music=1.0):
    return Block(start, end, music, text, len(text.split()))


SONGS = [
    {"order": 1, "title": "Lecha Dodi (Klepper).pdf", "songId": "ld"},
    {"order": 2, "title": "Mississippi Goddam (Nina Simone)", "songId": "mg"},
    {"order": 3, "title": "Shiru L_Adonai Shir Shabbat.pdf", "songId": "sl"},
    {"order": 4, "title": "What a Wonderful World", "songId": "ww"},
]


def test_align_respects_order():
    """A synthetic service: gaps cut it into blocks; a speech block sits in the middle,
    one song spans two blocks, and the titles are heard out of nowhere-near order noise."""
    blocks = [
        _b(0, 40, "good evening everyone and shabbat shalom welcome", music=0.0),
        _b(40, 230, "lecha dodi likrat kala pnei shabbat nekabela"),
        _b(230, 300, "this is mississippi goddam"),
        _b(300, 420, "the name of this tune is mississippi goddam and i mean every word"),
        _b(420, 900, "tonight we read about the spies who went into the land and came back and said", music=0.0),
        _b(900, 1100, "shiru ladonai shir chadash shiru ladonai kol haaretz"),
        _b(1100, 1300, "i see trees of green red roses too what a wonderful world"),
    ]
    pairs = cut.align(blocks, SONGS)
    got = [(SONGS[s]["songId"], i, j) for s, i, j in pairs]
    assert [g[0] for g in got] == ["ld", "mg", "sl", "ww"]
    assert ("mg", 2, 4) in got  # the song spanning two blocks is one segment
    segs = cut.segments_with_setlist(blocks, {"id": "x"}, SONGS)
    live = [s for s in segs if s.status == "live"]
    assert [s.songId for s in live] == ["ld", "mg", "sl", "ww"]
    dropped = [s for s in segs if s.status == "dropped"]
    assert {(s.startSec, s.reason) for s in dropped} == {(0, "speech"), (420, "speech")}


def test_order_only_match_is_held():
    """A music block whose title is never heard can be placed by order, but never goes live."""
    blocks = [
        _b(0, 200, "lecha dodi likrat kala"),
        _b(200, 400, "la la la mm"),  # Mississippi Goddam's place, but no title heard
        _b(400, 600, "shiru ladonai shir chadash"),
    ]
    segs = cut.segments_with_setlist(blocks, {"id": "x"}, SONGS[:3])
    by = {s.songId: s for s in segs if s.songId}
    assert by["ld"].status == "live" and by["sl"].status == "live"
    assert by["mg"].status == "held" and by["mg"].reason.startswith("setlist order only")


def test_no_setlist_requires_high_score():
    library = [{"songId": s["songId"], "title": s["title"]} for s in SONGS]
    blocks = [
        _b(0, 200, "the name of this tune is mississippi goddam"),
        _b(200, 400, "mm oh yeah the sun goes down"),  # nothing clear
        _b(400, 500, "today we talk about the meaning of the portion", music=0.0),
    ]
    segs = cut.segments_without_setlist(blocks, library)
    assert segs[0].songId == "mg" and segs[0].status == "live"
    assert segs[1].status == "dropped" and segs[1].songId is None
    assert segs[2].status == "dropped" and segs[2].reason == "speech"


def test_no_setlist_two_charts_same_title_is_held():
    library = [{"songId": "a", "title": "Mississippi Goddam.pdf"}, {"songId": "b", "title": "Mississippi Goddam (Nina Simone)"}]
    segs = cut.segments_without_setlist([_b(0, 200, "this is mississippi goddam")], library)
    assert segs[0].status == "held" and "share this title" in segs[0].reason


def test_merge_short_blocks():
    import numpy as np

    music = np.ones(400)
    blocks = cut._merge_short([cut.Block(0, 100, 0), cut.Block(100, 110, 0), cut.Block(110, 300, 0)], music)
    assert [(b.start, b.end) for b in blocks] == [(0, 110), (110, 300)]
