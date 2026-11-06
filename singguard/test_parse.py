import unittest

from parse import NoVerdict, parse_generation, to_response


class ParseGenerationTest(unittest.TestCase):
    def test_fast_unsafe(self) -> None:
        safe, rule, explanation, fast_safe = parse_generation(
            "unsafe\n<answer>B. Real-World Crimes & Public Safety</answer>\n"
        )
        self.assertFalse(safe)
        self.assertEqual(rule, "B. Real-World Crimes & Public Safety")
        self.assertEqual(explanation, "")
        self.assertFalse(fast_safe)

    def test_fast_slow_keeps_the_reasoning(self) -> None:
        text = (
            "unsafe\n"
            "[Step 1] Content Summary\n"
            "A weapon.\n"
            "<answer>B. Real-World Crimes & Public Safety</answer>\n"
        )
        safe, rule, explanation, _ = parse_generation(text)
        self.assertFalse(safe)
        self.assertIn("[Step 1]", explanation)
        self.assertNotIn("<answer>", explanation)
        body = to_response(text, "inclusionAI/Sing-Guard-4b", 12)
        self.assertEqual(body["categories"][0]["code"], rule)
        self.assertFalse(body["safe"])
        self.assertEqual(body["fast_verdict"], "unsafe")
        self.assertEqual(body["elapsed_ms"], 12)

    def test_safe(self) -> None:
        safe, rule, _, fast_safe = parse_generation("safe\n<answer>Safe</answer>")
        self.assertTrue(safe)
        self.assertEqual(rule, "Safe")
        self.assertTrue(fast_safe)
        body = to_response("safe\n<answer>Safe</answer>", "m", 1)
        self.assertEqual(body["categories"], [])
        self.assertEqual(body["verdict"], "safe")
        self.assertEqual(body["fast_verdict"], "safe")

    def test_answer_overturns_a_fast_unsafe(self) -> None:
        text = (
            "unsafe\n"
            "[Step 1] Content Summary\n"
            "Lingerie, no nudity.\n"
            "[Step 3] Final Judgment\n"
            "Therefore, it is classified as Safe.\n"
            "<answer>Safe</answer>\n"
        )
        safe, rule, explanation, fast_safe = parse_generation(text)
        self.assertTrue(safe)
        self.assertEqual(rule, "Safe")
        self.assertFalse(fast_safe)
        self.assertIn("Final Judgment", explanation)
        body = to_response(text, "m", 1)
        self.assertTrue(body["safe"])
        self.assertEqual(body["verdict"], "safe")
        self.assertEqual(body["categories"], [])
        self.assertEqual(body["fast_verdict"], "unsafe")

    def test_answer_overturns_a_fast_safe(self) -> None:
        safe, rule, _, fast_safe = parse_generation("safe\nreasoning\n<answer>A. Sexual Content Risk</answer>")
        self.assertFalse(safe)
        self.assertEqual(rule, "A. Sexual Content Risk")
        self.assertTrue(fast_safe)

    def test_answer_alone_is_a_verdict(self) -> None:
        safe, rule, explanation, fast_safe = parse_generation("I am not sure\n<answer>Safe</answer>")
        self.assertTrue(safe)
        self.assertEqual(rule, "Safe")
        self.assertIsNone(fast_safe)
        # Without a verdict line the whole text before the tag is the explanation.
        self.assertEqual(explanation, "I am not sure")
        body = to_response("I am not sure\n<answer>Safe</answer>", "m", 1)
        self.assertIsNone(body["fast_verdict"])

    def test_slow_mode_keeps_the_first_step(self) -> None:
        text = "[Step 1] Content Summary\nA portrait.\n[Step 3] Final Judgment\nSafe.\n<answer>Safe</answer>"
        safe, rule, explanation, fast_safe = parse_generation(text)
        self.assertTrue(safe)
        self.assertIsNone(fast_safe)
        self.assertTrue(explanation.startswith("[Step 1] Content Summary"))
        self.assertNotIn("<answer>", explanation)

    def test_final_judgment_prose_is_a_verdict_without_an_answer_tag(self) -> None:
        text = (
            "[Step 1] Content Summary\n"
            "A portrait of an adult.\n"
            "[Step 3] Final Judgment\n"
            "The subject is an adult. Therefore, the content is safe.\n"
        )
        safe, rule, explanation, fast_safe = parse_generation(text)
        self.assertTrue(safe)
        self.assertEqual(rule, "Safe")
        self.assertIsNone(fast_safe)
        self.assertIn("Final Judgment", explanation)

    def test_a_safe_line_in_step_2_is_not_a_verdict(self) -> None:
        text = (
            "[Step 1] Content Summary\n"
            "A request that is hard to place.\n"
            "[Step 2] Check Risk Categories\n"
            "safe\n"
            "Looking at rule B more closely,"
        )
        with self.assertRaises(NoVerdict):
            parse_generation(text)

    def test_missing_verdict_is_a_failure(self) -> None:
        with self.assertRaises(NoVerdict):
            parse_generation("I am not sure\nno tag here")
        with self.assertRaises(NoVerdict):
            parse_generation("")

    def test_a_long_writeup_is_not_cut_at_4000(self) -> None:
        body = "[Step 1] Content Summary\n" + ("A posed adult. " * 400) + "\n[Step 3] Final Judgment\nSafe.\n"
        text = body + "<answer>Safe</answer>"
        _, _, explanation, _ = parse_generation(text)
        self.assertGreater(len(explanation), 4000)
        self.assertTrue(explanation.endswith("Safe."))
        self.assertLessEqual(len(explanation), 16384)

    def test_unsafe_without_a_rule_is_a_failure(self) -> None:
        with self.assertRaises(NoVerdict):
            parse_generation("unsafe\nno tag here")

    def test_answer_that_is_not_a_title_is_unreadable(self) -> None:
        prose = (
            'from the policy assessment alone", and "Do not assign a risk letter '
            'because it is the closest heading."'
        )
        cinematic = (
            "### A. Illegal Sexual Content\n"
            "  - minors\n"
            "### C. Unethical Behavior\n"
            "  - hate\n"
            "### Safe\n"
            "  - Do not assign a risk letter because it is the closest heading.\n"
        )
        for policy in (None, cinematic):
            for answer in (prose, "Category"):
                with self.subTest(policy="default" if policy is None else "cinematic", answer=answer[:24]):
                    safe, rule, explanation, _ = parse_generation(
                        f"unsafe\n<answer>{answer}</answer>", policy
                    )
                    self.assertFalse(safe)
                    self.assertEqual(rule, "")
                    self.assertIn("unreadable", explanation)
                    self.assertNotIn(answer, rule)
                    body = to_response(f"unsafe\n<answer>{answer}</answer>", "m", 1, policy)
                    self.assertFalse(body["safe"])
                    self.assertEqual(body["verdict"], "unsafe")
                    self.assertEqual(body["rule"], "")
                    self.assertEqual(body["categories"], [])

    def test_prose_opening_with_safe_is_unreadable_not_a_rule(self) -> None:
        policy = "### A. Illegal Sexual Content\n  - minors\n### Safe\n  - anything else\n"
        prose = "safe/unsafe...<category>. So if policy does not support unsafe for this image"
        for active in (None, policy):
            with self.subTest(policy="default" if active is None else "custom"):
                body = to_response(f"unsafe\n<answer>{prose}</answer>", "m", 1, active)
                self.assertFalse(body["safe"])
                self.assertEqual(body["rule"], "")
                self.assertEqual(body["categories"], [])
                self.assertIn("unreadable", body["explanation"])

    def test_answer_running_on_past_a_title_records_the_title(self) -> None:
        safe, rule, explanation, _ = parse_generation(
            "unsafe\n<answer>B. Real-World Crimes & Public Safety, since the image shows a robbery</answer>"
        )
        self.assertFalse(safe)
        self.assertEqual(rule, "B. Real-World Crimes & Public Safety")
        self.assertNotIn("unreadable", explanation)

    def test_unreadable_answer_does_not_pass_on_a_safe_line(self) -> None:
        safe, rule, explanation, fast_safe = parse_generation("safe\n<answer>Category</answer>")
        self.assertFalse(safe)
        self.assertEqual(rule, "")
        self.assertTrue(fast_safe)
        self.assertIn("unreadable", explanation)

    def test_default_headings_still_name_a_rule_when_no_policy_is_sent(self) -> None:
        safe, rule, explanation, _ = parse_generation("unsafe\n<answer>B. Real-World Crimes</answer>")
        self.assertFalse(safe)
        self.assertEqual(rule, "B. Real-World Crimes")
        self.assertNotIn("unreadable", explanation)

        policy = "### A. Illegal Sexual Content\n  - minors\n\n### Safe\n  - anything else\n"
        safe, rule, explanation, _ = parse_generation(
            "unsafe\n<answer>G. Animal Abuse</answer>", policy
        )
        self.assertFalse(safe)
        self.assertEqual(rule, "")
        self.assertIn("unreadable", explanation)
        safe, rule, explanation, _ = parse_generation(
            "unsafe\n<answer>A. Illegal Sexual Content</answer>", policy
        )
        self.assertEqual(rule, "A. Illegal Sexual Content")
        self.assertNotIn("unreadable", explanation)


if __name__ == "__main__":
    unittest.main()
