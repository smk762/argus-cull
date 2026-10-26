import unittest

from parse import NoVerdict, parse_generation, to_response


class ParseGenerationTest(unittest.TestCase):
    def test_fast_unsafe(self) -> None:
        safe, rule, explanation = parse_generation(
            "unsafe\n<answer>B. Real-World Crimes & Public Safety</answer>\n"
        )
        self.assertFalse(safe)
        self.assertEqual(rule, "B. Real-World Crimes & Public Safety")
        self.assertEqual(explanation, "")

    def test_fast_slow_keeps_the_reasoning(self) -> None:
        text = (
            "unsafe\n"
            "[Step 1] Content Summary\n"
            "A weapon.\n"
            "<answer>B. Real-World Crimes & Public Safety</answer>\n"
        )
        safe, rule, explanation = parse_generation(text)
        self.assertFalse(safe)
        self.assertIn("[Step 1]", explanation)
        self.assertNotIn("<answer>", explanation)
        body = to_response(text, "inclusionAI/Sing-Guard-4b", 12)
        self.assertEqual(body["categories"][0]["code"], rule)
        self.assertFalse(body["safe"])
        self.assertEqual(body["elapsed_ms"], 12)

    def test_safe(self) -> None:
        safe, rule, _ = parse_generation("safe\n<answer>Safe</answer>")
        self.assertTrue(safe)
        self.assertEqual(rule, "Safe")
        body = to_response("safe\n<answer>Safe</answer>", "m", 1)
        self.assertEqual(body["categories"], [])
        self.assertEqual(body["verdict"], "safe")

    def test_missing_verdict_is_a_failure(self) -> None:
        with self.assertRaises(NoVerdict):
            parse_generation("I am not sure\n<answer>Safe</answer>")

    def test_unsafe_without_a_rule_is_a_failure(self) -> None:
        with self.assertRaises(NoVerdict):
            parse_generation("unsafe\nno tag here")


if __name__ == "__main__":
    unittest.main()
