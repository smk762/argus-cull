# Argus Cull demo set: provenance

The 53 images in this demo are **synthetic**, generated on 2026-11-14 and 2026-11-15 for this demo. The five people in them are
**fictional**: each was described in words, not taken from photos, and none depicts or imitates a real person. They
are written as adults aged 27 to 30, and MiVOLO reads every face as an adult of 25 or older (lowest 25.5, on one
swimwear frame). Content runs from bland to swimsuit-catalogue level: bikinis, one opaque satin lingerie set, two opaque silk boudoir frames (a slip and a robe), sports
bras and crop tops, shirtless men at the beach and gym, an open denim jacket, and red satin evening dresses (one
form-fitting, one with cut-outs, one with a deeper neckline). There is no nudity: no nipple or areola is visible in any
frame, nothing is see-through, and nothing is posed beyond swimsuit- or lingerie-catalogue norms.

Eleven frames are crime-film stills, made so the demo shows guard verdicts that are not about nudity: prop handguns
raised or held down and pointed away from the camera (an action hero, a 1940s detective, a spy on a rooftop, a cop in a
parking garage, 1970s heist and getaway scenes), a drug deal at a table of cellophane-wrapped bricks and heaps of white powder with cash, a smuggler holding cash beside a car
trunk and a wall of cellophane-wrapped bricks, and a blindfolded hostage with roped wrists in a warehouse. None has blood, injury, a victim of violence,
real-world events, sexual framing, or a weapon aimed at the viewer, and none is set in a school, library, gym hall,
playground or locker room or combined with swimwear or lingerie. SingGuard judges all eleven under rule B (Real-World Crimes & Public Safety) under at least one of `adult`,
`default`, `adult-granular` and `adult-cautious`, and Safe under `adult-cinematic`, which treats crime and violence
in film as Safe; on the recorded run `adult-cinematic` read the drug deal and the smuggler as rule G (Criminal
Instructions) instead. `default` is SingGuard's own general policy, the safe-for-work baseline; the four `adult*`
policies are curator's. Every other frame is Safe under all five policies, except C's lingerie set and E's boudoir
robe, which `default` reads as sexual content (rule A).

The scores, ages and verdicts on the page are what argus-curator 0.15.1 recorded when it scanned this set. Nothing
was edited by hand. One scan setting differs from curator's default: the **face clustering distance is 0.8**
(`faces.cluster_eps`; curator's default is 0.5), tuned for this synthetic set so that each person has one main face
cluster and no cluster mixes two people. At 0.5 the set splits into about 39 clusters; 0.85 already merges B and D.

## Folders

| Folder | What is in it |
|---|---|
| `personA/` to `personE/` | the five fictional people, one folder each: everyday scenes, swim, fitness and lingerie frames, the evening dresses, the crime-film stills, and scenes chosen to hit the setting cohorts (classroom, school gym hall, library, playground, locker room) with a clothed adult in them |
| `rejects/` | frames made to fail a check (blur, low resolution, aspect ratio, a near duplicate, a watermark), and the B+E group shot, which the identity profile holds back (see below) |

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
   numbers, face-swap halos or a pose beyond swimsuit-catalogue norms were dropped. Every frame was then scanned with
   the demo's own detector stack (NudeNet 640m, EraX, the watermark detector with `crops: detect`, MiVOLO, SingGuard
   under all four policies) and kept only if it had no watermark detection, no exposed sensitive NudeNet label, MiVOLO
   25 or over, and either Safe under every policy or, for the crime stills, rule B and nothing else.
7. **Clean-up.** Saved as JPEG from fresh pixel buffers: no EXIF, XMP or generator metadata. The demo serves WebP copies
   made from those files, again without metadata.

Every scene prompt starts with the person's description and ends with "professional photograph, soft natural
daylight, natural skin texture, realistic, sharp focus" (the first two film stills end with "cinematic film still" instead of the daylight phrase; the later crime stills
put the scene first and a short identity phrase after it, so the props survive CLIP's 77-token limit). The negative prompt:

> nude, nsfw, topless woman, nipples, areola, see-through, sheer fabric, wet t-shirt, lingerie, underwear, panties, thong, erotic, seductive, provocative pose, celebrity, famous person, teenager, teen, young girl, young boy, child, children, kid, childlike, schoolgirl, petite, baby face, cartoon, anime, manga, furry, painting, illustration, drawing, 3d render, cgi, doll, plastic skin, deformed, disfigured, extra fingers, bad hands, watermark, text, logo, brand, nike, adidas, numbers, signature, getty images, shutterstock, stock photo watermark, credit line, letters, writing, jersey number, printed graphics, frame, low quality, worst quality

Re-renders added "swoosh, emblem, crest, badge, logo on clothing, printed text on clothing, spread legs, legs apart".
The two film stills added "blood, gore, wound, injury, injured person, dead body, corpse, violence against a person,
gun pointed at the camera, aiming at the viewer, muzzle facing the camera, soldier, military uniform, war, terrorist,
rifle, assault rifle, police badge, sign, poster". The later crime stills used a short negative prompt that fits
CLIP's limit: "face mask, respirator, gag, nude, nipples, cleavage, child, teen, blood, gore, wound, injury, bruise,
syringe, needle, text, logo, letters, numbers, watermark, badge, sign, cartoon, illustration, 3d render, deformed, bad
hands, gun pointed at the camera, low quality". The lingerie frame's: "nude, topless, nipples, areola, see-through,
sheer fabric, mesh, transparent lace, child, teen, petite, baby face, spread legs, from below, text, logo, letters,
numbers, watermark, cartoon, illustration, 3d render, deformed, bad hands, low quality".

## People

- **Person A:** a fictional 28 year old Black woman, athletic fit build, shoulder-length natural curly black hair.
- **Person B:** a fictional 29 year old East Asian man, fit athletic build, short black undercut hair, light stubble.
- **Person C:** a fictional 27 year old South Asian woman, slim fit build, long dark wavy hair.
- **Person D:** a fictional 30 year old Hispanic man, muscular build, short dark hair, neatly trimmed dark beard.
- **Person E:** a fictional 28 year old white woman, athletic toned build, shoulder-length blonde hair.

## Images

The MiVOLO column is the curator's own reading in the recorded scan.

| File | Intended category | MiVOLO age (curator scan) | Scene prompt |
|---|---|---|---|
| `personA/A_beach_bikini.jpg` | swim / fitness | 34.3 | wearing a coral bikini, standing on a tropical beach, one hand in her hair, confident smile, thigh-up shot, swimsuit magazine photoshoot, golden hour |
| `personA/A_boudoir_slip.jpg` | boudoir | 30.6 | boudoir photo, a 28 year old Black woman with shoulder-length natural curly black hair, sitting on the edge of a bed, wearing an opaque champagne silk slip dress, one thin strap slipped off her shoulder, soft warm lamp light, cosy bedroom, thigh-up shot, three-quarter view, looking at the camera, professional photograph, natural skin texture, realistic |
| `personA/A_cafe.jpg` | bland | 28.1 | wearing a mustard knit top, three-quarter view, sitting at a table in a cosy cafe holding a coffee cup, upper body portrait |
| `personA/A_gym_sportsbra.jpg` | swim / fitness | 33.7 | wearing a black sports bra and high-waisted leggings, toned abs, standing in a gym with weights behind her, waist-up portrait, fitness photo |
| `personA/A_heist_film.jpg` | crime (film still) | 25.9 | cinematic 1970s heist film still, woman in a dark green leather jacket beside a vintage car at night, holding a black pistol raised and pointed up at the sky, a 28 year old Black woman with shoulder-length natural curly black hair, waist-up, three-quarter view |
| `personA/A_noir_detective.jpg` | weapon (film still) | 33.8 | 1940s private detective in a white shirt and waistcoat at a desk in a dim office, venetian blind shadows; she holds a pistol upright on the desk, pointed away from the camera |
| `personA/A_office.jpg` | bland | 27.6 | wearing a white blouse, smiling at the camera, upper body portrait, in a bright modern office |
| `personA/A_street.jpg` | bland (replacement) | 28.0 | wearing a plain rust-coloured crew-neck knit sweater, plain fabric, three-quarter view, upper body, on a city street, daylight |
| `personA/A_street_openJacket.jpg` | swim / fitness (restored) | 27.6 | wearing a denim jacket, three-quarter view, upper body, on a city street, daylight |
| `personA/A_teacher_classroom.jpg` | cohort scene | 33.1 | adult teacher standing at the front of a classroom beside a green chalkboard, rows of empty wooden student desks and chairs in the foreground, wide shot, wearing a blue blouse and grey cardigan, looking at the camera |
| `personB/B_coach_gymnasium.jpg` | cohort scene | 34.3 | adult sports coach wearing a plain navy polo shirt, whistle on a cord, holding a clipboard, standing in a large empty school gym hall with wooden wall bars, climbing ropes hanging from the ceiling and gym mats, wide shot, looking at the camera (retouched: shirt logo, crest and sign glyphs inpainted out) |
| `personB/B_detective_film.jpg` | crime (film still) | 32.2 | cinematic cop thriller film still, detective in a plain dark suit standing in a dim parking garage at night, holding a black pistol pointed down at the ground beside his leg, a 29 year old East Asian man with short black undercut hair and light stubble, waist-up, looking at the camera |
| `personB/B_drugdeal_film.jpg` | crime (film still), replaces the earlier take | 27.3 | crime film still, drug deal in a dim back room, a man seated at a table covered with kilo bricks of white powder in clear cellophane, one brick cut open spilling white powder on the table, a digital scale, small baggies of white powder, stacks of cash, a 29 year old East Asian man with short black undercut hair and light stubble, tense, waist-up, three-quarter view, film lighting |
| `personB/B_gym_shirtless.jpg` | swim / fitness | 31.5 | shirtless, toned muscular chest and abs, wearing black gym shorts, standing in a gym holding a dumbbell, waist-up portrait, fitness photo |
| `personB/B_kitchen.jpg` | bland | 31.0 | wearing a grey t-shirt and dark apron, three-quarter view, chopping vegetables in a home kitchen, upper body |
| `personB/B_office.jpg` | bland | 32.7 | wearing a light blue button-down shirt, looking at the camera, head and shoulders portrait, in a modern office |
| `personB/B_park.jpg` | bland (replacement) | 30.2 | wearing a plain charcoal crew-neck wool sweater, plain fabric, looking at the camera, upper body, standing in a city park, autumn trees |
| `personB/B_pool_shirtless.jpg` | swim / fitness | 29.8 | shirtless, toned athletic chest, wearing navy swim shorts, standing beside a resort swimming pool, waist-up portrait, sunny day, holiday photo |
| `personC/C_cafe.jpg` | bland (replacement) | 27.9 | wearing a plain cream crew-neck sweater, gentle closed-mouth smile, three-quarter view, sitting by a cafe window, upper body |
| `personC/C_evening_cutout.jpg` | swim / fitness (restored) | 27.1 | form-fitting red satin evening gown with thin straps (the render came out with side cut-outs), rooftop terrace at dusk, waist-up |
| `personC/C_evening_gown.jpg` | swim / fitness | 26.7 | wearing a form-fitting red satin evening gown with thin straps, standing on a rooftop terrace at dusk, city lights, waist-up portrait, fashion photo |
| `personC/C_evening_neckline.jpg` | swim / fitness (restored) | 28.1 | same prompt as above, another seed: a deeper sweetheart neckline and a cut-out at the waist |
| `personC/C_kitchen.jpg` | bland | 26.5 | wearing a white linen shirt, three-quarter view, holding a mug in a bright home kitchen, upper body |
| `personC/C_librarian_library.jpg` | cohort scene | 28.5 | adult librarian wearing a burgundy cardigan, holding books, standing in a large public library with tall rows of bookstacks and long wooden reading tables with lamps, wide shot, looking at the camera |
| `personC/C_lingerie.jpg` | lingerie | 26.8 | wearing an opaque black satin bra and matching high-waisted briefs, standing upright by a window in a bright bedroom, editorial lingerie catalogue photo, thigh-up shot, looking at the camera, professional photograph, soft natural daylight, natural skin texture, realistic |
| `personC/C_park.jpg` | bland | 28.8 | wearing a rust coloured coat, smiling at the camera, upper body portrait, outdoors in a park, daylight |
| `personC/C_pool_bikini.jpg` | swim / fitness | 25.5 | wearing a white bikini, standing in waist-deep water in a resort swimming pool, smiling, waist-up portrait, sunny day, swimsuit photoshoot |
| `personC/C_rooftop_film.jpg` | crime (film still) | 25.8 | spy thriller, wearing a dark trench coat, holding a black prop pistol pointed up beside her shoulder, rainy night rooftop, waist-up, three-quarter view, cinematic film still, crime thriller, film lighting |
| `personC/C_spy_film.jpg` | crime (film still) | 26.9 | spy thriller, wearing a dark trench coat, holding a black prop pistol pointed up beside her shoulder, rainy night rooftop, waist-up, three-quarter view, cinematic film still, crime thriller, film lighting |
| `personD/D_action_film.jpg` | weapon (film still) | 38.9 | action movie hero in a dark leather jacket, his arm raised and a black prop pistol pointed up and away from the camera, explosion bokeh behind, film set lighting |
| `personD/D_beach_shirtless.jpg` | swim / fitness | 34.6 | shirtless, muscular chest and abs, wearing teal board shorts, standing on a sandy beach, waist-up portrait, ocean behind him, summer daylight |
| `personD/D_cafe.jpg` | bland | 36.5 | wearing a white linen shirt, three-quarter view, sitting at a cafe table with a laptop, upper body |
| `personD/D_gym_shirtless.jpg` | swim / fitness | 36.5 | shirtless, muscular chest and arms, wearing grey gym shorts, standing in a gym beside a pull-up bar, waist-up portrait, fitness photo |
| `personD/D_hostage_film.jpg` | crime (film still) | 32.3 | cinematic thriller film still, hostage blindfolded with a black cloth over his eyes, wrists tied together with thick rope, seated on a wooden chair in an empty warehouse, a 30 year old Hispanic man with short dark hair and a trimmed dark beard, fully clothed in a grey hoodie, medium shot |
| `personD/D_playground_bench.jpg` | cohort scene | 36.2 | wearing a grey hoodie and jeans, sitting alone on a bench beside an empty playground with swings and a slide, park, daylight, wide shot |
| `personD/D_smuggler_film.jpg` | crime (film still), replaces the earlier take | 31.6 | cartel film still at night, drug smuggler holding a kilo brick of white cocaine in clear plastic wrap beside an open car trunk full of identical white bricks and bundles of cash, a 30 year old Hispanic man with short dark hair and a trimmed dark beard, dark jacket, waist-up, three-quarter view |
| `personD/D_street.jpg` | bland | 37.5 | wearing a black leather jacket over a white t-shirt, looking at the camera, upper body portrait, on a city street, daylight |
| `personD/D_surf_shirtless.jpg` | swim / fitness | 34.4 | shirtless, black wetsuit peeled down to his waist, holding a surfboard under his arm on a beach, waist-up portrait, morning light |
| `personE/E_beach_bikini.jpg` | swim / fitness | 34.3 | wearing a plain navy blue bikini, standing on a white sand beach, smiling at the camera, thigh-up shot, swimsuit magazine photoshoot, sunny day |
| `personE/E_boudoir_robe.jpg` | boudoir | 31.8 | boudoir photo, a 28 year old white woman with shoulder-length blonde hair, reclining on a velvet chaise longue, wearing an opaque ivory silk robe slipping off one shoulder over an opaque satin camisole, soft warm lamp light, elegant bedroom, thigh-up shot, legs together, looking at the camera, professional photograph, natural skin texture, realistic |
| `personE/E_cafe.jpg` | bland | 29.0 | wearing a green sweater, reading a book at a cafe table, three-quarter view, upper body |
| `personE/E_getaway_film.jpg` | crime (film still) | 30.6 | cinematic 1970s heist film still, woman in a brown leather jacket beside a vintage car at night, holding a black pistol raised and pointed up at the sky, a 28 year old white woman with shoulder-length blonde hair, waist-up, three-quarter view |
| `personE/E_heist_film.jpg` | crime (film still) | 27.1 | cinematic 1970s heist film still, woman in a brown leather jacket beside a vintage car at night, holding a black pistol raised and pointed up at the sky, a 28 year old white woman with shoulder-length blonde hair, waist-up, three-quarter view |
| `personE/E_locker_room.jpg` | cohort scene (replacement) | 30.9 | wearing a plain solid navy sweatshirt and plain solid navy sweatpants, no logos, standing in a sports locker room, long rows of plain unmarked grey metal lockers and a wooden bench filling the frame, medium wide shot, looking at the camera |
| `personE/E_office.jpg` | bland | 37.1 | wearing a navy blazer, smiling at the camera, upper body portrait, in a bright modern office |
| `personE/E_park.jpg` | bland | 36.2 | wearing a camel coat and scarf, three-quarter view, upper body, walking in a city park, autumn trees |
| `personE/E_run_cropTop.jpg` | swim / fitness | 35.9 | wearing a plain solid teal sports crop top with no logos and plain black running shorts, standing on a coastal path after a run, hands on hips, toned midriff, thigh-up shot, fitness photo |
| `rejects/A_cafe_neardup.jpg` | reject: near-duplicate (2% border crop, resized back, brightness +4%, JPEG q80) | 28.6 | wearing a mustard knit top, three-quarter view, sitting at a table in a cosy cafe holding a coffee cup, upper body portrait |
| `rejects/BE_group_cafe.jpg` | group shot (held: see below) | 34.2/29.8 | photo of two adult friends sitting side by side at a table in a bright cafe smiling at the camera, a 28 year old white woman with shoulder-length blonde hair in a plain green sweater and a 29 year old East Asian man with short black hair and light stubble in a plain light blue shirt, coffee cups, upper body, plain walls, no signs |
| `rejects/B_office_blurred.jpg` | reject: blur (Gaussian blur r=8) | - | wearing a light blue button-down shirt, looking at the camera, head and shoulders portrait, in a modern office |
| `rejects/C_kitchen_lowres.jpg` | reject: low resolution (downscaled to 160 px wide) | - | wearing a white linen shirt, three-quarter view, holding a mug in a bright home kitchen, upper body |
| `rejects/D_beach_banner.jpg` | reject: aspect ratio 5:1 (2.25x Lanczos upscale, 5:1 band at 30% height (2736x547)) | - | small in frame, walking along a wide beach promenade at sunset, wide landscape shot |
| `rejects/D_cafe_watermark.jpg` | reject: watermark ('SAMPLE ©' box bottom-right) | 33.8 | wearing a white linen shirt, three-quarter view, sitting at a cafe table with a laptop, upper body |

The intended category is what each frame was made to show, not what the curator decided. Notes on what the page shows:

- **Crime stills.** Every flag under the four strict policies is rule B, and SingGuard's slow pass (the reasoned verdict) names the handgun, the
  drug packages and cash, or the restrained, blindfolded hostage. Not every still trips all three strict policies on
  every run: the guard is a language model, so a borderline still can read Safe under one policy and B under another.
  Takes that read as anything but rule B (a pistol raised near the head read as self-harm, rule C; a frightened
  hostage read as under 25 or sexual) were dropped.
- **Lingerie, boudoir and swimwear** are Safe under all four `adult*` policies: they treat a single adult posing in
  lingerie or swimwear for the camera as Safe. SingGuard's general `default` policy passes the swimwear but reads C's
  lingerie set and E's boudoir robe as sexual content (rule A), so those frames show as Split. It read A's boudoir slip
  as rule A on two of four scans and Safe on the recorded one: the safe-for-work baseline and the adult policies
  disagree, which is what the policy comparison is for. NudeNet reads them as covered breast, belly and armpits, which is right.
- **Group shot.** `rejects/BE_group_cafe.jpg` is a fine frame, but the scan's identity profile multiplies the score of
  a frame with more than one face by 0.4, so it cannot reach the 0.6 keep threshold and is left out as under the
  quality minimum. Its two faces still join B's and E's clusters.
- **Face clusters.** At distance 0.8 each person has one main cluster, and no cluster mixes two people. Five dark crime stills
  sit apart in three small clusters: B's parking-garage detective and drug deal together, D's blindfolded hostage alone
  (the blindfold hides the eyes), and E's heist and getaway stills together.
- **Watermark check.** Only the deliberate watermark frame has a detection; it is cropped (its bottom strip), not
  rejected. Earlier takes of B's park frame, C's café frame and A's street frame had a zip, a mouth and a jacket pocket
  seam read as watermarks and were replaced.
- **Rejects.** The blur reject fails the sharpness gate, the low-resolution and banner frames fail their gates, and the
  near duplicate is marked as a duplicate of `personA/A_cafe.jpg` and left out of the keep set.

## Frames added on 2026-11-15

The drug deal and the smuggler replace earlier, vaguer takes under the same names, and the two boudoir frames are new. Their rows are in the Images table above.

Generated on 2026-11-15 with the same recipe as the rest of the set: SDXL text render with **CyberRealistic XL Desire
v2.0**, then an **InstantID** identity pass from the person's synthetic reference portrait. Settings: diffusers,
DPM++ 2M SDE Karras, 30 steps, CFG 5.0; IdentityNet ControlNet 0.85, IP-Adapter 0.9. The frames were saved as JPEG
(quality 90) from fresh pixel buffers, with no EXIF, XMP or generator metadata. Nothing was retouched.

The set is now 53 frames. Two crime stills were replaced under their old names, and two boudoir frames were added.

As with the later crime stills, the scene comes first and a short identity phrase follows, so the props fit within
CLIP's 77-token limit. The render did not draw everything named in the prompt:

- **Drug-deal frame:** cellophane-wrapped bricks, heaps of loose white powder and cash on the table; no scale or baggies. He sits with his head in his hands.
- **Smuggler frame:** a wall of cellophane-wrapped white bricks in and beside the trunk, and a strapped bundle of cash
  in his hand. There is no cut-open brick.

Negative prompts:

- Crime stills: "second person, (other people, crowd,) face mask, (gag,) nude, (nipples, cleavage,) child, teen,
  blood, gore, wound, (injury,) syringe, needle, snorting, (hand on face,) smoking, gun, license plate, text, logo,
  letters, numbers, watermark, label, (sign,) cartoon, illustration, 3d render, deformed, bad hands, low quality".
  Terms in brackets were used in one of the two prompts only.
- Boudoir frames: "nude, topless, nipples, areola, see-through, sheer fabric, mesh, transparent lace, wet, child,
  teen, petite, baby face, spread legs, from below, crotch, second person, text, logo, letters, numbers, watermark,
  cartoon, anime, illustration, 3d render, deformed, bad hands, low quality".

### Checks

Every candidate was checked by eye. Candidates were dropped for any of these reasons:

- a second person in the frame;
- powder at the face, which reads as drug use;
- pseudo-text on labels or licence plates;
- semi-sheer lace;
- a raised-thigh or rear-view pose;
- any nudity.

Every kept frame was then scanned with the demo's detector stack under all five guard policies (`default`, `adult`,
`adult-granular`, `adult-cautious`, `adult-cinematic`). None has a watermark detection or an exposed sensitive
NudeNet label. NudeNet reads the boudoir frames as covered breast and armpits, which is right.

- **Crime stills:** both new stills read rule B under `adult`, `adult-granular`, `adult-cautious` and `default`.
- **Boudoir frames:** both are Safe under every `adult*` policy, as the policies treat a single adult posing in
  lingerie for the camera as Safe. SingGuard's general `default` policy flags them under rule A (sexual content) on
  most runs, as it does the satin lingerie frame.

At face distance 0.8, the smuggler and both boudoir frames join their person's main face cluster; the drug deal joins B's small dark-still cluster with the detective.

## Licences

- **CyberRealistic XL Desire v2.0:** CreativeML Open RAIL-M, as declared on the author's model card. Generated outputs
  may be used, including in public demos, subject to the licence's use restrictions (no impersonation of real people,
  no harmful content). This set keeps to them: fictional adults, no nudity, and prop weapons, drugs and restraint only in
  film-style stills.
- **InstantID** (InstantX; pipeline code, IdentityNet ControlNet and IP-Adapter weights): Apache-2.0.
- **InsightFace `antelopev2` / `buffalo_l`** (the face encoder InstantID uses, and the detector for the age check):
  InsightFace releases its pretrained weights for **non-commercial research use only**. They were used only to make and
  check this non-commercial demo set.
- **MiVOLO v2:** Apache-2.0. **NudeNet:** AGPL-3.0 code, MIT weights. **OpenCV** (the inpainting retouch): Apache-2.0.
- **DejaVu Sans** (the watermark font): Bitstream Vera licence, a permissive free-font licence.
