# Argus Cull demo set: provenance

The 41 images in this demo are **synthetic**, generated on 2026-11-14 for this demo. The five people in them are
**fictional**: each was described in words, not taken from photos, and none depicts or imitates a real person. They
are written as adults aged 27 to 30, and MiVOLO reads every face as an adult of about 26 to 39 (lowest 25.5, on one
swimwear frame; nothing under 25). Content runs from bland to swimsuit-magazine level: bikinis, sports bras and crop
tops, shirtless men at the beach and gym, an open denim jacket over a bare chest, and red satin evening dresses (one
form-fitting, one with cut-outs, one with a deeper neckline). There is no nudity: no nipple or areola is visible in any
frame, nothing is see-through, and there is no lingerie or sexualised posing beyond swimsuit-catalogue norms.

Two frames are film-style stills with a prop handgun, added so the demo shows a guard verdict that is not about nudity:
an action-film hero with the pistol raised and pointed up, away from the camera, and a 1940s detective at her desk with
a pistol held upright. Neither has blood, injury, a victim, real-world events, or a weapon aimed at the viewer, and no
weapon appears in a school, library, gym hall, playground or locker-room scene or with swimwear.

The scores, ages and verdicts on the page are what argus-curator 0.15.1 recorded when it scanned this set. Nothing
was edited by hand.

## Folders

| Folder | What is in it |
|---|---|
| `personA/` to `personE/` | the five fictional people, one folder each: everyday scenes, swim and fitness frames, the evening dresses, the two film stills, and scenes chosen to hit the setting cohorts (classroom, school gym hall, library, playground, locker room) with a clothed adult in them |
| `mixed/` | a group shot of B and E |
| `rejects/` | frames made to fail a check: blur, low resolution, aspect ratio, a near duplicate, and a watermark |

## Recipe

1. **Text render.** SDXL text-to-image, checkpoint **CyberRealistic XL Desire v2.0** (by Cyberdelia), diffusers,
   DPM++ 2M SDE Karras, 30 steps, CFG 5.0, 832x1216 (portrait) or 1216x832 (landscape). Two to four seeds per scene;
   the best was kept.
2. **Identity pass.** Every kept scene was re-rendered with **InstantID** (InstantX; IdentityNet ControlNet 0.85 and
   IP-Adapter 0.9, same checkpoint and sampler), so each person keeps one face across scenes. The face embedding comes
   from one synthetic reference portrait per person, and the head pose from the scene's own text render.
3. **Group shot.** A text render of two people; each of the two largest faces was re-rendered with InstantID on a
   1024 px crop and blended back with a tight, face-only feathered mask.
4. **One retouch.** `personB/B_coach_gymnasium.jpg` (the gym hall): a generated sportswear swoosh, a crest with
   pseudo-lettering on the shirt, and glyphs on two wall tags were removed with OpenCV Telea inpainting. No other
   frame was retouched.
5. **Rejects**, derived from identity renders: near duplicate (2% border crop, resized back, brightness +4%, JPEG
   quality 80); blur (Gaussian blur, radius 8); low resolution (downscaled to 160 px wide); aspect ratio (a 5:1 band of
   a 2.25x upscale, 2736x547); watermark (a semi-transparent "SAMPLE ©" box drawn bottom-right).
6. **Checks during generation.** Every frame was checked by eye, with NudeNet (no exposed female breast, genitalia,
   buttocks or anus in any kept frame at generation time) and with MiVOLO (no face under 25). Frames with logos, text,
   numbers, face-swap halos or a pose beyond swimsuit-catalogue norms were dropped.
7. **Clean-up.** Saved as JPEG from fresh pixel buffers: no EXIF, XMP or generator metadata. The demo serves WebP copies
   made from those files, again without metadata.

Every scene prompt starts with the person's description and ends with "professional photograph, soft natural
daylight, natural skin texture, realistic, sharp focus" (the two film stills end with "cinematic film still" instead
of the daylight phrase). The negative prompt:

> nude, nsfw, topless woman, nipples, areola, see-through, sheer fabric, wet t-shirt, lingerie, underwear, panties, thong, erotic, seductive, provocative pose, celebrity, famous person, teenager, teen, young girl, young boy, child, children, kid, childlike, schoolgirl, petite, baby face, cartoon, anime, manga, furry, painting, illustration, drawing, 3d render, cgi, doll, plastic skin, deformed, disfigured, extra fingers, bad hands, watermark, text, logo, brand, nike, adidas, numbers, signature, getty images, shutterstock, stock photo watermark, credit line, letters, writing, jersey number, printed graphics, frame, low quality, worst quality

Re-renders added "swoosh, emblem, crest, badge, logo on clothing, printed text on clothing, spread legs, legs apart".
The two film stills added "blood, gore, wound, injury, injured person, dead body, corpse, violence against a person,
gun pointed at the camera, aiming at the viewer, muzzle facing the camera, soldier, military uniform, war, terrorist,
rifle, assault rifle, police badge, sign, poster".

## People

- **Person A:** a fictional 28 year old Black woman, athletic fit build, shoulder-length natural curly black hair.
- **Person B:** a fictional 29 year old East Asian man, fit athletic build, short black undercut hair, light stubble.
- **Person C:** a fictional 27 year old South Asian woman, slim fit build, long dark wavy hair.
- **Person D:** a fictional 30 year old Hispanic man, muscular build, short dark hair, neatly trimmed dark beard.
- **Person E:** a fictional 28 year old white woman, athletic toned build, shoulder-length blonde hair.

## Images

The MiVOLO age column is the generation-time check (face only); the page shows the curator's own reading, which
agrees to within about a year.

| File | Intended category | MiVOLO age (generation check) | Scene (after the person's description) |
|---|---|---|---|
| `personA/A_beach_bikini.jpg` | swim / fitness | 34.3 | wearing a coral bikini, standing on a tropical beach, one hand in her hair, confident smile, thigh-up shot, swimsuit magazine photoshoot, golden hour |
| `personA/A_cafe.jpg` | bland | 27.8 | wearing a mustard knit top, three-quarter view, sitting at a table in a cosy cafe holding a coffee cup, upper body portrait |
| `personA/A_gym_sportsbra.jpg` | swim / fitness | 33.7 | wearing a black sports bra and high-waisted leggings, toned abs, standing in a gym with weights behind her, waist-up portrait, fitness photo |
| `personA/A_noir_detective.jpg` | weapon (film still) | 34.0 | 1940s private detective in a white shirt and waistcoat at a desk in a dim office, venetian blind shadows; she holds a pistol upright on the desk, pointed away from the camera |
| `personA/A_office.jpg` | bland | 27.6 | wearing a white blouse, smiling at the camera, upper body portrait, in a bright modern office |
| `personA/A_street.jpg` | bland | 29.2 | wearing a denim jacket over a white t-shirt, three-quarter view, upper body, on a city street, daylight |
| `personA/A_teacher_classroom.jpg` | cohort scene | 33.1 | adult teacher standing at the front of a classroom beside a green chalkboard, rows of empty wooden student desks and chairs in the foreground, wide shot, wearing a blue blouse and grey cardigan, looking at the camera |
| `personB/B_coach_gymnasium.jpg` | cohort scene | 34.3 | adult sports coach wearing a plain navy polo shirt, whistle on a cord, holding a clipboard, standing in a large empty school gym hall with wooden wall bars, climbing ropes hanging from the ceiling and gym mats, wide shot, looking at the camera (retouched: shirt logo, crest and sign glyphs inpainted out) |
| `personB/B_gym_shirtless.jpg` | swim / fitness | 31.5 | shirtless, toned muscular chest and abs, wearing black gym shorts, standing in a gym holding a dumbbell, waist-up portrait, fitness photo |
| `personB/B_kitchen.jpg` | bland | 31.1 | wearing a grey t-shirt and dark apron, three-quarter view, chopping vegetables in a home kitchen, upper body |
| `personB/B_office.jpg` | bland | 32.7 | wearing a light blue button-down shirt, looking at the camera, head and shoulders portrait, in a modern office |
| `personB/B_park.jpg` | bland | 31.0 | wearing an olive bomber jacket, looking at the camera, upper body, standing in a city park, autumn trees |
| `personB/B_pool_shirtless.jpg` | swim / fitness | 29.8 | shirtless, toned athletic chest, wearing navy swim shorts, standing beside a resort swimming pool, waist-up portrait, sunny day, holiday photo |
| `personB/B_street_openJacket.jpg` | swim / fitness (restored) | 30.7 | wearing an open denim jacket over a bare chest, toned abs, three-quarter view, upper body, on a city street, daylight |
| `personC/C_cafe.jpg` | bland | 26.2 | wearing a cream sweater, three-quarter view, sitting by a cafe window, upper body |
| `personC/C_evening_cutout.jpg` | swim / fitness (restored) | 27.2 | form-fitting red satin evening gown with thin straps (the render came out with side cut-outs), rooftop terrace at dusk, waist-up |
| `personC/C_evening_gown.jpg` | swim / fitness | 26.6 | wearing a form-fitting red satin evening gown with thin straps, standing on a rooftop terrace at dusk, city lights, waist-up portrait, fashion photo |
| `personC/C_evening_neckline.jpg` | swim / fitness (restored) | 28.1 | same prompt as above, another seed: a deeper sweetheart neckline and a cut-out at the waist |
| `personC/C_kitchen.jpg` | bland | 26.5 | wearing a white linen shirt, three-quarter view, holding a mug in a bright home kitchen, upper body |
| `personC/C_librarian_library.jpg` | cohort scene | 28.5 | adult librarian wearing a burgundy cardigan, holding books, standing in a large public library with tall rows of bookstacks and long wooden reading tables with lamps, wide shot, looking at the camera |
| `personC/C_park.jpg` | bland | 28.8 | wearing a rust coloured coat, smiling at the camera, upper body portrait, outdoors in a park, daylight |
| `personC/C_pool_bikini.jpg` | swim / fitness | 25.5 | wearing a white bikini, standing in waist-deep water in a resort swimming pool, smiling, waist-up portrait, sunny day, swimsuit photoshoot |
| `personD/D_action_film.jpg` | weapon (film still) | 38.4 | action movie hero in a dark leather jacket, his arm raised and a black prop pistol pointed up and away from the camera, explosion bokeh behind, film set lighting |
| `personD/D_beach_shirtless.jpg` | swim / fitness | 34.6 | shirtless, muscular chest and abs, wearing teal board shorts, standing on a sandy beach, waist-up portrait, ocean behind him, summer daylight |
| `personD/D_cafe.jpg` | bland | 36.5 | wearing a white linen shirt, three-quarter view, sitting at a cafe table with a laptop, upper body |
| `personD/D_gym_shirtless.jpg` | swim / fitness | 36.5 | shirtless, muscular chest and arms, wearing grey gym shorts, standing in a gym beside a pull-up bar, waist-up portrait, fitness photo |
| `personD/D_playground_bench.jpg` | cohort scene | 36.2 | wearing a grey hoodie and jeans, sitting alone on a bench beside an empty playground with swings and a slide, park, daylight, wide shot |
| `personD/D_street.jpg` | bland | 37.5 | wearing a black leather jacket over a white t-shirt, looking at the camera, upper body portrait, on a city street, daylight |
| `personD/D_surf_shirtless.jpg` | swim / fitness | 34.4 | shirtless, black wetsuit peeled down to his waist, holding a surfboard under his arm on a beach, waist-up portrait, morning light |
| `personE/E_beach_bikini.jpg` | swim / fitness | 34.3 | wearing a plain navy blue bikini, standing on a white sand beach, smiling at the camera, thigh-up shot, swimsuit magazine photoshoot, sunny day |
| `personE/E_cafe.jpg` | bland | 29.0 | wearing a green sweater, reading a book at a cafe table, three-quarter view, upper body |
| `personE/E_locker_room.jpg` | cohort scene | 35.6 | wearing a plain solid green cotton t-shirt and plain green shorts, no logos, sitting upright on a bench with knees together in a sports locker room with rows of metal lockers, medium wide shot, looking at the camera, fully clothed |
| `personE/E_office.jpg` | bland | 37.1 | wearing a navy blazer, smiling at the camera, upper body portrait, in a bright modern office |
| `personE/E_park.jpg` | bland | 36.2 | wearing a camel coat and scarf, three-quarter view, upper body, walking in a city park, autumn trees |
| `personE/E_run_cropTop.jpg` | swim / fitness | 35.8 | wearing a plain solid teal sports crop top with no logos and plain black running shorts, standing on a coastal path after a run, hands on hips, toned midriff, thigh-up shot, fitness photo |
| `mixed/BE_group_cafe.jpg` | bland (group B+E) | 29.8/34.2 | photo of two adult friends sitting side by side at a table in a bright cafe smiling at the camera, a 28 year old white woman with shoulder-length blonde hair in a plain green sweater and a 29 year old East Asian man with short black hair and light stubble in a plain light blue shirt, coffee cups, upper body, plain walls, no signs |
| `rejects/A_cafe_neardup.jpg` | reject: near-duplicate (2% border crop, resized back, brightness +4%, JPEG q80) | 28.6 | wearing a mustard knit top, three-quarter view, sitting at a table in a cosy cafe holding a coffee cup, upper body portrait |
| `rejects/B_office_blurred.jpg` | reject: blur (Gaussian blur r=8) | 30.2 | wearing a light blue button-down shirt, looking at the camera, head and shoulders portrait, in a modern office |
| `rejects/C_kitchen_lowres.jpg` | reject: low resolution (downscaled to 160 px wide) | 25.9 | wearing a white linen shirt, three-quarter view, holding a mug in a bright home kitchen, upper body |
| `rejects/D_beach_banner.jpg` | reject: aspect ratio 5:1 (2.25x Lanczos upscale, 5:1 band at 30% height (2736x547)) | 33.9 | small in frame, walking along a wide beach promenade at sunset, wide landscape shot |
| `rejects/D_cafe_watermark.jpg` | reject: watermark ('SAMPLE ©' box bottom-right) | 34.0 | wearing a white linen shirt, three-quarter view, sitting at a cafe table with a laptop, upper body |

The intended category is what each frame was made to show, not what the curator decided. The page shows the curator's own readings, and
some differ from the intent:

- **Weapons.** SingGuard judges both film stills under rule B (Real-World Crimes & Public Safety: weapons) under
  `adult`, `adult-granular` and `adult-cautious`, and Safe under `adult-cinematic`, whose rules treat crime and
  violence in film as Safe. The page veils both under its default policy blur. An earlier take of the action still, with
  the pistol raised closer to his head, was judged under rule C (self-harm) and replaced.
- **Locker room.** NudeNet reads an exposed female breast at 0.39 on the clothed locker-room frame (the box sits on
  her lap and shorts), so it is rated explicit and veiled. The generation-time NudeNet check (the 320n model) found
  nothing exposed there; the curator's sidecar runs the larger 640m model.
- **Watermark check.** The detector marks a jacket zip (`personB/B_park.jpg`) and a mouth (`personC/C_cafe.jpg`)
  mid-frame as watermarks; no edge crop removes them, so `crops: detect` rejects both as overlays. The real watermark
  frame is cropped (its bottom strip) rather than rejected.
- **Rejects.** The blur reject fails the sharpness gate, the low-resolution and banner frames fail their gates, and
  the near duplicate is marked as a duplicate of `personA/A_cafe.jpg` and left out of the keep set.
- **Face clusters.** InstantID keeps each person recognisable, but at the curator's default cluster distance most
  frames still form their own face cluster rather than one per person.

## Licences

- **CyberRealistic XL Desire v2.0:** CreativeML Open RAIL-M, as declared on the author's model card. Generated outputs
  may be used, including in public demos, subject to the licence's use restrictions (no impersonation of real people,
  no harmful content). This set keeps to them: fictional adults, no nudity, and prop weapons only in film-style stills.
- **InstantID** (InstantX; pipeline code, IdentityNet ControlNet and IP-Adapter weights): Apache-2.0.
- **InsightFace `antelopev2` / `buffalo_l`** (the face encoder InstantID uses, and the detector for the age check):
  InsightFace releases its pretrained weights for **non-commercial research use only**. They were used only to make and
  check this non-commercial demo set.
- **MiVOLO v2:** Apache-2.0. **NudeNet:** AGPL-3.0 code, MIT weights. **OpenCV** (the inpainting retouch): Apache-2.0.
- **DejaVu Sans** (the watermark font): Bitstream Vera licence, a permissive free-font licence.
