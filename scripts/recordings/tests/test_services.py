from datetime import date

import services as S


def test_parse_folder_date():
    mod = date(2026, 2, 1)
    assert S.parse_folder_date("1.10_SAT MORNING", mod) == date(2026, 1, 10)
    assert S.parse_folder_date("6.07.25_BEN WORTHINGTON", mod) == date(2025, 6, 7)
    assert S.parse_folder_date("26.3.27_SHIR SHABBAT", mod) == date(2026, 3, 27)
    assert S.parse_folder_date("8.16 - 8.17", date(2025, 8, 19)) == date(2025, 8, 16)
    assert S.parse_folder_date("6.19", date(2026, 7, 1)) == date(2026, 6, 19)
    # no year: the latest year on or before the (approximate) modified date
    assert S.parse_folder_date("11.14_SHIR SHABBAT", date(2025, 12, 1)) == date(2025, 11, 14)
    assert S.parse_folder_date("12.20", date(2026, 1, 5), slack_days=0) == date(2025, 12, 20)
    # Dropbox's "8 months ago" can land just before the service; the slack covers it
    assert S.parse_folder_date("2.28_TYSON BAR MITZVAH", date(2026, 2, 20)) == date(2026, 2, 28)
    assert S.parse_folder_date("SHIR SHABBAT", mod) is None


def test_service_date_falls_back_to_file_name():
    assert S.service_date("SHIR SHABBAT", "SHIR SHABBAT_V1_25.10.24.mp3", date(2025, 10, 30)) == date(2025, 10, 24)


def test_kind_from_folder():
    assert S.kind_from_folder("4.24_SHIR SHABBAT") == "shir_shabbat"
    assert S.kind_from_folder("1.10_SAT MORNING") == "sat_morning"
    assert S.kind_from_folder("6.07.25_BEN WORTHINGTON") == "bnei_mitzvah"
    assert S.kind_from_folder("2.28_TYSON BAR MITZVAH") == "bnei_mitzvah"
    assert S.kind_from_folder("6.14.25") is None
    assert S.kind_from_folder("SAT MORNING_25.06.14_V2.mp3") == "sat_morning"


def _sl(id, day, name, tt=None, occ=None, songs=2):
    return {
        "id": id, "name": name, "eventDate": f"{day}T17:00:00.000Z", "templateType": tt, "occasion": occ,
        "tracks": [{"order": i, "title": f"Song {i}", "type": "song", "songId": f"s{i}"} for i in range(songs)],
    }


def test_match_setlist_picks_by_kind():
    cat = {"setlists": [
        _sl("fri", "2026-06-19", "Shir Shabbat — June 19", "shir-shabbat"),
        _sl("sat", "2026-06-20", "Shabbat Morning — June 20", "shabbat_morning"),
        _sl("bm", "2026-06-20", "Bar Mitzvah — Ray — June 20", "bnei_mitzvah_saturday", "bnei-mitzvah"),
        _sl("stub", "2026-06-21", "Shabbat Morning — June 21", "shabbat_morning", songs=0),
    ]}
    assert S.match_setlist(date(2026, 6, 19), "shir_shabbat", cat)["id"] == "fri"
    assert S.match_setlist(date(2026, 6, 20), "sat_morning", cat)["id"] == "sat"
    assert S.match_setlist(date(2026, 6, 20), "bnei_mitzvah", cat)["id"] == "bm"
    # an empty stub can't guide a cut: no setlist
    assert S.match_setlist(date(2026, 6, 21), "sat_morning", cat) is None
    assert S.match_setlist(date(2026, 6, 22), "sat_morning", cat) is None


def test_ambiguous_setlist_holds_service():
    """Two setlists of the same kind on one day: never pick one silently."""
    cat = {"setlists": [
        _sl("a", "2026-06-13", "Shabbat Morning — June 13", None, "regular", songs=20),
        _sl("b", "2026-06-13", "Shabbat Morning — June 13", None, "regular", songs=19),
    ]}
    assert S.match_setlist(date(2026, 6, 13), "sat_morning", cat) == "ambiguous"
    # and a bare-date folder with two setlists of different kinds is ambiguous too
    cat2 = {"setlists": [
        _sl("x", "2026-06-20", "Shabbat Morning — June 20", "shabbat_morning"),
        _sl("y", "2026-06-20", "Havdalah — June 20", "campfire"),
    ]}
    assert S.match_setlist(date(2026, 6, 20), None, cat2) == "ambiguous"
