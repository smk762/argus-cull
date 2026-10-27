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
        safe, rule, _, fast_safe = parse_generation("I am not sure\n<answer>Safe</answer>")
        self.assertTrue(safe)
        self.assertEqual(rule, "Safe")
        self.assertIsNone(fast_safe)
        body = to_response("I am not sure\n<answer>Safe</answer>", "m", 1)
        self.assertIsNone(body["fast_verdict"])

    def test_missing_verdict_is_a_failure(self) -> None:
        with self.assertRaises(NoVerdict):
            parse_generation("I am not sure\nno tag here")
        with self.assertRaises(NoVerdict):
            parse_generation("")

    def test_unsafe_without_a_rule_is_a_failure(self) -> None:
        with self.assertRaises(NoVerdict):
            parse_generation("unsafe\nno tag here")


if __name__ == "__main__":
    unittest.main()
