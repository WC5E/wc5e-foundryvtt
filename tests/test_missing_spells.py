import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build"))
import missing_spells


class TempManifest(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self._orig = missing_spells.PATH
        missing_spells.PATH = os.path.join(self._dir.name, "missing-spells.json")

    def tearDown(self):
        missing_spells.PATH = self._orig
        self._dir.cleanup()


class TestSkeleton(TempManifest):
    def test_load_returns_skeleton_when_absent(self):
        d = missing_spells.load()
        self.assertEqual(d["version"], missing_spells.MANIFEST_VERSION)
        self.assertEqual(d["monsters"], {})
        self.assertEqual(d["spellLists"], {})
        self.assertEqual(d["aliases"], {})

    def test_save_then_load_roundtrips(self):
        missing_spells.set_monsters({"abc": {"name": "Ghoul", "pack": "monsters", "spells": []}})
        self.assertEqual(missing_spells.load()["monsters"]["abc"]["name"], "Ghoul")

    def test_save_is_deterministic_and_newline_terminated(self):
        missing_spells.set_aliases({"b": "2", "a": "1"})
        first = open(missing_spells.PATH, encoding="utf-8").read()
        missing_spells.set_aliases({"a": "1", "b": "2"})
        second = open(missing_spells.PATH, encoding="utf-8").read()
        self.assertEqual(first, second)
        self.assertTrue(first.endswith("\n"))
        self.assertLess(first.index('"a"'), first.index('"b"'))


class TestSectionIsolation(TempManifest):
    def test_set_monsters_replaces_whole_section(self):
        missing_spells.set_monsters({"a": {"name": "A", "pack": "monsters", "spells": []}})
        missing_spells.set_monsters({"b": {"name": "B", "pack": "monsters", "spells": []}})
        self.assertEqual(sorted(missing_spells.load()["monsters"]), ["b"])

    def test_set_spell_lists_preserves_the_other_journal(self):
        missing_spells.set_spell_lists("JCLASS", {
            "JCLASS.p1": {"name": "Mage Spells", "identifier": "wc5e-mage",
                          "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JSUB", {
            "JSUB.p9": {"name": "Study of Destruction Spells", "identifier": "sub",
                        "pack": "spell-lists", "spells": []}})
        keys = sorted(missing_spells.load()["spellLists"])
        self.assertEqual(keys, ["JCLASS.p1", "JSUB.p9"])

    def test_set_spell_lists_replaces_only_its_own_journal(self):
        missing_spells.set_spell_lists("JCLASS", {"JCLASS.p1": {"name": "one", "identifier": "i",
                                                                "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JSUB", {"JSUB.p9": {"name": "keep", "identifier": "i",
                                                            "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JCLASS", {"JCLASS.p2": {"name": "two", "identifier": "i",
                                                                "pack": "spell-lists", "spells": []}})
        keys = sorted(missing_spells.load()["spellLists"])
        self.assertEqual(keys, ["JCLASS.p2", "JSUB.p9"])

    def test_prefix_match_is_on_the_dot_boundary(self):
        """A journal id that is a prefix of another must not be clobbered."""
        missing_spells.set_spell_lists("JA", {"JA.p1": {"name": "a", "identifier": "i",
                                                        "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JAB", {"JAB.p1": {"name": "b", "identifier": "i",
                                                          "pack": "spell-lists", "spells": []}})
        missing_spells.set_spell_lists("JAB", {"JAB.p2": {"name": "b2", "identifier": "i",
                                                          "pack": "spell-lists", "spells": []}})
        self.assertEqual(sorted(missing_spells.load()["spellLists"]), ["JA.p1", "JAB.p2"])

        # Exposing direction: re-set the *shorter* id after the *longer* one already
        # holds data. A buggy `prefix = journal_id` (missing the dot) would match
        # "JAB.p2" as well and wipe it here.
        missing_spells.set_spell_lists("JA", {"JA.p3": {"name": "a3", "identifier": "i",
                                                        "pack": "spell-lists", "spells": []}})
        self.assertEqual(sorted(missing_spells.load()["spellLists"]), ["JA.p3", "JAB.p2"])


import spell_embed


class TestUnmatchedRecords(unittest.TestCase):
    TRAIT = ("The mage is a 5th-level spellcaster. Its spellcasting ability is Intelligence "
             "(spell save DC 14). It has the following spells prepared:\n"
             "Cantrips (at will): fire bolt, shape water\n"
             "1st level (4 slots): magic missile, ice knife\n")

    INNATE = ("Its innate spellcasting ability is Charisma (spell save DC 13).\n"
              "At will: blade ward\n"
              "2/day each: hex\n")

    def test_parse_keeps_raw_and_normalised_names(self):
        parsed = spell_embed.parse_spellcasting(self.TRAIT)
        pairs = [p for g in parsed["groups"] for p in g["names"]]
        self.assertIn(("shape water", "shape water"), pairs)
        self.assertTrue(all(isinstance(p, tuple) and len(p) == 2 for p in pairs))

    def test_unmatched_records_carry_preparation_context(self):
        actor = {"system": {"attributes": {}, "spells": {}}, "items": []}
        mon = {"traits": [{"name": "Spellcasting", "text": self.TRAIT}],
               "abilities": {"int": 16}}
        _, unmatched = spell_embed.embed_spellcasting(
            actor, mon, "actor1", 3, lambda s: (s - 10) // 2)
        by_key = {u["key"]: u for u in unmatched}
        self.assertIn("shape water", by_key)
        self.assertEqual(by_key["shape water"]["prep"], "prepared")
        self.assertEqual(by_key["shape water"]["level"], 0)
        self.assertIsNone(by_key["shape water"]["perDay"])

    def test_innate_records_carry_per_day(self):
        actor = {"system": {"attributes": {}, "spells": {}}, "items": []}
        mon = {"traits": [{"name": "Innate Spellcasting", "text": self.INNATE}],
               "abilities": {"cha": 16}}
        _, unmatched = spell_embed.embed_spellcasting(
            actor, mon, "actor2", 3, lambda s: (s - 10) // 2)
        by_key = {u["key"]: u for u in unmatched}
        self.assertEqual(by_key["blade ward"]["prep"], "atwill")
        self.assertEqual(by_key["hex"]["prep"], "innate")
        self.assertEqual(by_key["hex"]["perDay"], 2)

    def test_statblock_fragments_are_dropped(self):
        """'shadow bolt 1st-5th level : arms of hadar' is a mis-split line, not a spell."""
        parsed = spell_embed.parse_spellcasting(
            "Its spellcasting ability is Charisma (spell save DC 13).\n"
            "1st level (4 slots): shadow bolt 1st-5th level : arms of hadar, hex\n")
        keys = [k for g in parsed["groups"] for _, k in g["names"]]
        self.assertNotIn("shadow bolt 1st-5th level : arms of hadar", keys)
        self.assertIn("hex", keys)


if __name__ == "__main__":
    unittest.main()
