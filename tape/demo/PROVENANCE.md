# Argus Cull demo set: provenance

The 67 images in this demo are 53 **synthetic** frames of five fictional adults, generated on 2026-11-14 and
2026-11-15 for this demo, and 14 **real photographs** under `photos/`: CC0 sports photos from
[PD12M](https://huggingface.co/datasets/Spawning/PD12M), shared with argus-studio's `/curate` demo, which uses 36 of
the synthetic frames in turn. Each photo is listed with its PD12M id and licence under [Photos](#photos).

The five people in the synthetic frames are **fictional**: each was described in words, not taken from photos, and
none depicts or imitates a real person. They are written as adults aged 27 to 30. Content runs from bland to
swimsuit-catalogue level: bikinis, one opaque satin lingerie set, two opaque silk boudoir frames (a slip and a robe),
sports bras and crop tops, shirtless men at the beach and gym, an open denim jacket, and red satin evening dresses (one
form-fitting, one with cut-outs, one with a deeper neckline). There is no nudity: no nipple or areola is visible in any
frame, nothing is see-through, and nothing is posed beyond swimsuit- or lingerie-catalogue norms. The photos show real
athletes in public competition (handball, volleyball, cross-country skiing, athletics).

**Ages.** Every measured face, background included, must read 18 or older, and `web/src/lib/tape.test.ts` fails the
tape otherwise (fail safe: one under-18 read anywhere, in a crowd too, keeps a frame out). On the recorded run MiVOLO
reads the photos' faces from 20.8 (`photos/handball_a/01.jpg`) up, and the synthetic faces from 24.9 up. NudeNet's
`suggestive` rating (sports kit, swimwear) was never a reason to leave a frame out.

Eleven synthetic frames are crime-film stills, made so the demo shows guard verdicts that are not about nudity: prop
handguns raised or held down and pointed away from the camera (an action hero, a 1940s detective, a spy on a rooftop,
a cop in a parking garage, 1970s heist and getaway scenes), a drug deal at a table of cellophane-wrapped bricks and
heaps of white powder with cash, a smuggler holding cash beside a car trunk and a wall of cellophane-wrapped bricks,
and a blindfolded hostage with roped wrists in a warehouse. None has blood, injury, a victim of violence, real-world
events, sexual framing, or a weapon aimed at the viewer, and none is set in a school, library, gym hall, playground or
locker room or combined with swimwear or lingerie. `default` is SingGuard's own general policy, the safe-for-work
baseline; the four `adult*` policies are curator's. What each policy said on the recorded run is under
[What the recorded scan shows](#what-the-recorded-scan-shows).

The scores, ages and verdicts on the page are what argus-curator 0.18.0 (its `dev` commit `b94d89b`, the one
`sync/argus-curator.json` pins) recorded when it scanned this set on 2026-11-21. Nothing was edited by hand. One scan
setting differs from curator's default: the **face clustering distance is 0.8** (`faces.cluster_eps`; curator's
default is 0.5), tuned for the synthetic set so that each person has one main face cluster and no cluster mixes two
people. At 0.5 the synthetic set splits into about 39 clusters; 0.85 already merges B and D.

## Folders

| Folder | What is in it |
|---|---|
| `personA/` to `personE/` | the five fictional people, one folder each: everyday scenes, swim, fitness and lingerie frames, the evening dresses, the crime-film stills, and scenes chosen to hit the setting cohorts (classroom, school gym hall, library, playground, locker room) with a clothed adult in them |
| `photos/` | the 14 real CC0 photographs (see [Photos](#photos)): two handball players, a volleyball player, a cross-country skier, a relay team, a near duplicate and three photo rejects |
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
| `personA/A_beach_bikini.jpg` | swim / fitness | 33.4 | wearing a coral bikini, standing on a tropical beach, one hand in her hair, confident smile, thigh-up shot, swimsuit magazine photoshoot, golden hour |
| `personA/A_boudoir_slip.jpg` | boudoir | 30.7 | boudoir photo, a 28 year old Black woman with shoulder-length natural curly black hair, sitting on the edge of a bed, wearing an opaque champagne silk slip dress, one thin strap slipped off her shoulder, soft warm lamp light, cosy bedroom, thigh-up shot, three-quarter view, looking at the camera, professional photograph, natural skin texture, realistic |
| `personA/A_cafe.jpg` | bland | 28.5 | wearing a mustard knit top, three-quarter view, sitting at a table in a cosy cafe holding a coffee cup, upper body portrait |
| `personA/A_gym_sportsbra.jpg` | swim / fitness | 32.5 | wearing a black sports bra and high-waisted leggings, toned abs, standing in a gym with weights behind her, waist-up portrait, fitness photo |
| `personA/A_heist_film.jpg` | crime (film still) | 24.9 | cinematic 1970s heist film still, woman in a dark green leather jacket beside a vintage car at night, holding a black pistol raised and pointed up at the sky, a 28 year old Black woman with shoulder-length natural curly black hair, waist-up, three-quarter view |
| `personA/A_noir_detective.jpg` | weapon (film still) | 33.2 | 1940s private detective in a white shirt and waistcoat at a desk in a dim office, venetian blind shadows; she holds a pistol upright on the desk, pointed away from the camera |
| `personA/A_office.jpg` | bland | 28.1 | wearing a white blouse, smiling at the camera, upper body portrait, in a bright modern office |
| `personA/A_street.jpg` | bland (replacement) | 28.3 | wearing a plain rust-coloured crew-neck knit sweater, plain fabric, three-quarter view, upper body, on a city street, daylight |
| `personA/A_street_openJacket.jpg` | swim / fitness (restored) | 27.0 | wearing a denim jacket, three-quarter view, upper body, on a city street, daylight |
| `personA/A_teacher_classroom.jpg` | cohort scene | 32.2 | adult teacher standing at the front of a classroom beside a green chalkboard, rows of empty wooden student desks and chairs in the foreground, wide shot, wearing a blue blouse and grey cardigan, looking at the camera |
| `personB/B_coach_gymnasium.jpg` | cohort scene | 31.9 | adult sports coach wearing a plain navy polo shirt, whistle on a cord, holding a clipboard, standing in a large empty school gym hall with wooden wall bars, climbing ropes hanging from the ceiling and gym mats, wide shot, looking at the camera (retouched: shirt logo, crest and sign glyphs inpainted out) |
| `personB/B_detective_film.jpg` | crime (film still) | 31.9 | cinematic cop thriller film still, detective in a plain dark suit standing in a dim parking garage at night, holding a black pistol pointed down at the ground beside his leg, a 29 year old East Asian man with short black undercut hair and light stubble, waist-up, looking at the camera |
| `personB/B_drugdeal_film.jpg` | crime (film still), replaces the earlier take | 27.2 | crime film still, drug deal in a dim back room, a man seated at a table covered with kilo bricks of white powder in clear cellophane, one brick cut open spilling white powder on the table, a digital scale, small baggies of white powder, stacks of cash, a 29 year old East Asian man with short black undercut hair and light stubble, tense, waist-up, three-quarter view, film lighting |
| `personB/B_gym_shirtless.jpg` | swim / fitness | 31.2 | shirtless, toned muscular chest and abs, wearing black gym shorts, standing in a gym holding a dumbbell, waist-up portrait, fitness photo |
| `personB/B_kitchen.jpg` | bland | 30.9 | wearing a grey t-shirt and dark apron, three-quarter view, chopping vegetables in a home kitchen, upper body |
| `personB/B_office.jpg` | bland | 32.0 | wearing a light blue button-down shirt, looking at the camera, head and shoulders portrait, in a modern office |
| `personB/B_park.jpg` | bland (replacement) | 29.6 | wearing a plain charcoal crew-neck wool sweater, plain fabric, looking at the camera, upper body, standing in a city park, autumn trees |
| `personB/B_pool_shirtless.jpg` | swim / fitness | 29.5 | shirtless, toned athletic chest, wearing navy swim shorts, standing beside a resort swimming pool, waist-up portrait, sunny day, holiday photo |
| `personC/C_cafe.jpg` | bland (replacement) | 27.8 | wearing a plain cream crew-neck sweater, gentle closed-mouth smile, three-quarter view, sitting by a cafe window, upper body |
| `personC/C_evening_cutout.jpg` | swim / fitness (restored) | 27.5 | form-fitting red satin evening gown with thin straps (the render came out with side cut-outs), rooftop terrace at dusk, waist-up |
| `personC/C_evening_gown.jpg` | swim / fitness | 26.4 | wearing a form-fitting red satin evening gown with thin straps, standing on a rooftop terrace at dusk, city lights, waist-up portrait, fashion photo |
| `personC/C_evening_neckline.jpg` | swim / fitness (restored) | 28.4 | same prompt as above, another seed: a deeper sweetheart neckline and a cut-out at the waist |
| `personC/C_kitchen.jpg` | bland | 26.2 | wearing a white linen shirt, three-quarter view, holding a mug in a bright home kitchen, upper body |
| `personC/C_librarian_library.jpg` | cohort scene | 28.9 | adult librarian wearing a burgundy cardigan, holding books, standing in a large public library with tall rows of bookstacks and long wooden reading tables with lamps, wide shot, looking at the camera |
| `personC/C_lingerie.jpg` | lingerie | 26.8 | wearing an opaque black satin bra and matching high-waisted briefs, standing upright by a window in a bright bedroom, editorial lingerie catalogue photo, thigh-up shot, looking at the camera, professional photograph, soft natural daylight, natural skin texture, realistic |
| `personC/C_park.jpg` | bland | 29.0 | wearing a rust coloured coat, smiling at the camera, upper body portrait, outdoors in a park, daylight |
| `personC/C_pool_bikini.jpg` | swim / fitness | 27.1 | wearing a white bikini, standing in waist-deep water in a resort swimming pool, smiling, waist-up portrait, sunny day, swimsuit photoshoot |
| `personC/C_rooftop_film.jpg` | crime (film still) | 26.1 | spy thriller, wearing a dark trench coat, holding a black prop pistol pointed up beside her shoulder, rainy night rooftop, waist-up, three-quarter view, cinematic film still, crime thriller, film lighting |
| `personC/C_spy_film.jpg` | crime (film still) | 26.1 | spy thriller, wearing a dark trench coat, holding a black prop pistol pointed up beside her shoulder, rainy night rooftop, waist-up, three-quarter view, cinematic film still, crime thriller, film lighting |
| `personD/D_action_film.jpg` | weapon (film still) | 37.7 | action movie hero in a dark leather jacket, his arm raised and a black prop pistol pointed up and away from the camera, explosion bokeh behind, film set lighting |
| `personD/D_beach_shirtless.jpg` | swim / fitness | 34.5 | shirtless, muscular chest and abs, wearing teal board shorts, standing on a sandy beach, waist-up portrait, ocean behind him, summer daylight |
| `personD/D_cafe.jpg` | bland | 35.5 | wearing a white linen shirt, three-quarter view, sitting at a cafe table with a laptop, upper body |
| `personD/D_gym_shirtless.jpg` | swim / fitness | 35.6 | shirtless, muscular chest and arms, wearing grey gym shorts, standing in a gym beside a pull-up bar, waist-up portrait, fitness photo |
| `personD/D_hostage_film.jpg` | crime (film still) | 31.0 | cinematic thriller film still, hostage blindfolded with a black cloth over his eyes, wrists tied together with thick rope, seated on a wooden chair in an empty warehouse, a 30 year old Hispanic man with short dark hair and a trimmed dark beard, fully clothed in a grey hoodie, medium shot |
| `personD/D_playground_bench.jpg` | cohort scene | 35.2 | wearing a grey hoodie and jeans, sitting alone on a bench beside an empty playground with swings and a slide, park, daylight, wide shot |
| `personD/D_smuggler_film.jpg` | crime (film still), replaces the earlier take | 31.4 | cartel film still at night, drug smuggler holding a kilo brick of white cocaine in clear plastic wrap beside an open car trunk full of identical white bricks and bundles of cash, a 30 year old Hispanic man with short dark hair and a trimmed dark beard, dark jacket, waist-up, three-quarter view |
| `personD/D_street.jpg` | bland | 36.8 | wearing a black leather jacket over a white t-shirt, looking at the camera, upper body portrait, on a city street, daylight |
| `personD/D_surf_shirtless.jpg` | swim / fitness | 33.1 | shirtless, black wetsuit peeled down to his waist, holding a surfboard under his arm on a beach, waist-up portrait, morning light |
| `personE/E_beach_bikini.jpg` | swim / fitness | 31.5 | wearing a plain navy blue bikini, standing on a white sand beach, smiling at the camera, thigh-up shot, swimsuit magazine photoshoot, sunny day |
| `personE/E_boudoir_robe.jpg` | boudoir | 32.6 | boudoir photo, a 28 year old white woman with shoulder-length blonde hair, reclining on a velvet chaise longue, wearing an opaque ivory silk robe slipping off one shoulder over an opaque satin camisole, soft warm lamp light, elegant bedroom, thigh-up shot, legs together, looking at the camera, professional photograph, natural skin texture, realistic |
| `personE/E_cafe.jpg` | bland | 28.0 | wearing a green sweater, reading a book at a cafe table, three-quarter view, upper body |
| `personE/E_getaway_film.jpg` | crime (film still) | 29.7 | cinematic 1970s heist film still, woman in a brown leather jacket beside a vintage car at night, holding a black pistol raised and pointed up at the sky, a 28 year old white woman with shoulder-length blonde hair, waist-up, three-quarter view |
| `personE/E_heist_film.jpg` | crime (film still) | 26.4 | cinematic 1970s heist film still, woman in a brown leather jacket beside a vintage car at night, holding a black pistol raised and pointed up at the sky, a 28 year old white woman with shoulder-length blonde hair, waist-up, three-quarter view |
| `personE/E_locker_room.jpg` | cohort scene (replacement) | 30.7 | wearing a plain solid navy sweatshirt and plain solid navy sweatpants, no logos, standing in a sports locker room, long rows of plain unmarked grey metal lockers and a wooden bench filling the frame, medium wide shot, looking at the camera |
| `personE/E_office.jpg` | bland | 36.7 | wearing a navy blazer, smiling at the camera, upper body portrait, in a bright modern office |
| `personE/E_park.jpg` | bland | 35.5 | wearing a camel coat and scarf, three-quarter view, upper body, walking in a city park, autumn trees |
| `personE/E_run_cropTop.jpg` | swim / fitness | 35.7 | wearing a plain solid teal sports crop top with no logos and plain black running shorts, standing on a coastal path after a run, hands on hips, toned midriff, thigh-up shot, fitness photo |
| `rejects/A_cafe_neardup.jpg` | reject: near-duplicate (2% border crop, resized back, brightness +4%, JPEG q80) | 28.6 | wearing a mustard knit top, three-quarter view, sitting at a table in a cosy cafe holding a coffee cup, upper body portrait |
| `rejects/BE_group_cafe.jpg` | group shot (held: see below) | 34.0/30.3 | photo of two adult friends sitting side by side at a table in a bright cafe smiling at the camera, a 28 year old white woman with shoulder-length blonde hair in a plain green sweater and a 29 year old East Asian man with short black hair and light stubble in a plain light blue shirt, coffee cups, upper body, plain walls, no signs |
| `rejects/B_office_blurred.jpg` | reject: blur (Gaussian blur r=8) | - | wearing a light blue button-down shirt, looking at the camera, head and shoulders portrait, in a modern office |
| `rejects/C_kitchen_lowres.jpg` | reject: low resolution (downscaled to 160 px wide) | - | wearing a white linen shirt, three-quarter view, holding a mug in a bright home kitchen, upper body |
| `rejects/D_beach_banner.jpg` | reject: aspect ratio 5:1 (2.25x Lanczos upscale, 5:1 band at 30% height (2736x547)) | - | small in frame, walking along a wide beach promenade at sunset, wide landscape shot |
| `rejects/D_cafe_watermark.jpg` | reject: watermark ('SAMPLE ©' box bottom-right) | 33.7 | wearing a white linen shirt, three-quarter view, sitting at a cafe table with a laptop, upper body |

The intended category is what each frame was made to show, not what the curator decided.

### The synthetic frames in this tape

The tape's synthetic frames are the WebP views of argus-cull's previous tape (the full 832×1216 renders; the banner
reject was scaled back from its 1600 px view to 2736×547), saved as JPEG for the rescan. Nothing else changed.

## Photos

The 14 photographs under `photos/` are real, released **CC0** (PD12M keeps only CC0 and Public Domain Mark images),
found and fetched through argus-quarry's PD12M index on 2026-11-21. They are argus-studio's `/curate` demo photos,
built by its `scripts/make_curator_sample.py` (pinned PD12M ids and sha256s; each scaled to at most 2048 px on the
long side and saved as a fresh JPEG with no EXIF or XMP). They were chosen so a person recurs across frames, and so
that every face, background included, reads as an adult: frames whose crowds held an under-18 read were left out.
Studio's [`PROVENANCE.md`](https://github.com/smk762/argus-studio/blob/dev/frontend/public/curator-sample/PROVENANCE.md)
has the full selection notes. The athletes were photographed in public competition; the demo names no one.

| File | PD12M id | Institution | Licence | What it shows |
|---|---|---|---|---|
| `photos/handball_a/01.jpg` | `dcdc8d02721d6a9d66949d917c1f1f71` | Wikimedia Commons | CC0 | a handball player, #10 in blue, ball in hand |
| `photos/handball_a/02.jpg` | `84c403799ac4194c50a7e2de43631344` | Wikimedia Commons | CC0 | the same player winding up a throw |
| `photos/handball_a/03.jpg` | `a673dd30d9051f45c59c4e846f0c287b` | Wikimedia Commons | CC0 | a player in yellow, #7, driving forward (the curator puts her in the same face cluster) |
| `photos/handball_b/01.jpg` | `2bed74fb5e122ae117fa27e5a3e687f6` | Wikimedia Commons | CC0 | a handball player in coral, mid-throw |
| `photos/handball_b/02.jpg` | `ec3e8c751205cff6789e9bfb146f4f81` | Wikimedia Commons | CC0 | the same player, #8, on court |
| `photos/volleyball/01.jpg` | `35cfe2e5d8dae19ec21b019c2a532913` | Wikimedia Commons | CC0 | a volleyball player in blue and white, leaping to serve |
| `photos/volleyball/02.jpg` | `9f12f7f0e4a630e047f1e3ddd26f8718` | Wikimedia Commons | CC0 | the same player a moment later, arm back |
| `photos/skier/01.jpg` | `1281368a97e4484c1014afc344189c25` | Estonian Sports and Olympic Museum | CC0 | a cross-country skier in red gloves and goggles |
| `photos/skier/02.jpg` | `e3b09846f651f96b5daee7ad42de8064` | Estonian Sports and Olympic Museum | CC0 | the same skier racing at the Nagano Olympics, bib 33 |
| `photos/skier/02_copy.jpg` | as `photos/skier/02.jpg` | Estonian Sports and Olympic Museum | CC0 (derived from a CC0 frame) | near duplicate (2% crop, re-encoded) |
| `photos/relay/group_shot.jpg` | `43dae84e9f1380cf01e57aa878662a28` | Wikimedia Commons | CC0 | a relay team together after their race |
| `photos/rejects/blurry.jpg` | `2e9ff3432b53c5628d2849e0a87c954f` | Wikimedia Commons | CC0 (derived from a CC0 frame) | a marathon runner (blurred) |
| `photos/rejects/lowres.jpg` | `121d9531114127b8bf7c45dbdeeaccad` | Wikimedia Commons | CC0 (derived from a CC0 frame) | a high jumper over the bar (160 px wide) |
| `photos/rejects/wide_banner.jpg` | `09dc65f4cb65d342991f2ed171b711e7` | Wikimedia Commons | CC0 (derived from a CC0 frame) | a relay heat (5:1 band) |

The four derived frames (`photos/skier/02_copy.jpg`, a 2% edge crop; the three `photos/rejects/` frames, a radius-8
Gaussian blur, a 160 px-wide copy and a 5:1 band of a 2.25× upscale) are released under CC0 too.

## What the recorded scan shows

- **SingGuard.** Every passing frame has a verdict under all five policies. Thirteen frames are recorded unsafe under
  at least one; the page veils twelve of them until you unblur them (see the boudoir slip below):

  | Frame | adult | default | adult-granular | adult-cautious | adult-cinematic |
  |---|---|---|---|---|---|
  | `personA/A_boudoir_slip.jpg` | | | | A | |
  | `personA/A_heist_film.jpg` | B | B | | B | |
  | `personA/A_noir_detective.jpg` | B | | B | B | |
  | `personB/B_detective_film.jpg` | | B | B | B | |
  | `personB/B_drugdeal_film.jpg` | B | B | B | B | |
  | `personC/C_lingerie.jpg` | | A | | | |
  | `personC/C_rooftop_film.jpg` | B | B | B | B | |
  | `personC/C_spy_film.jpg` | | B | B | B | |
  | `personD/D_action_film.jpg` | | | B | B | |
  | `personD/D_hostage_film.jpg` | | C | B | | |
  | `personD/D_smuggler_film.jpg` | B | B | B | B | G |
  | `personE/E_getaway_film.jpg` | B | B | B | B | |
  | `personE/E_heist_film.jpg` | B | B | B | B | |

  Letters are each policy's own rule: B is real-world crime and public safety under every policy that used it, G
  (`adult-cinematic`) criminal instructions, C (`default`) unethical behaviour, and A is sexual content under
  `default` but illegal sexual content (age or consent unclear) under `adult-cautious`. `adult-cinematic` treats crime
  in film as Safe, so only the smuggler's bricks and cash still trip it (G). The guard is a language model, so a
  borderline frame can change between runs: on this run `default` passed E's boudoir robe, which the previous
  recording flagged. `adult-cautious`'s A on A's boudoir slip is recorded as unsafe, but its own reasoning says the
  policy points to Safe and that it labelled the frame Unsafe only to follow a hint; the page reads the slow
  pass's reasoning as the verdict, so the slip shows Safe and is kept. Every photo is Safe under all five.
- **Nudity.** NudeNet rates 21 passing frames `suggestive` (sports kit, swimwear, lingerie, evening dresses) and 39
  safe. It rates one frame `explicit`: `photos/relay/group_shot.jpg`, four clothed sprinters, on a
  `FEMALE_GENITALIA_EXPOSED` hit of 0.41. That is a false positive, kept because the scan is recorded as it ran; the
  page blurs the frame, as it blurs any exposed reading, and every face in it reads as an adult, so it can be
  unblurred.
- **Group shots.** `rejects/BE_group_cafe.jpg` is a fine frame, but the scan's identity profile multiplies the score
  of a frame with more than one face by 0.4, so it cannot reach the 0.6 keep threshold and is left out as under the
  quality minimum. Its two faces still join B's and E's clusters. The relay team photo and the crowd frame
  `photos/handball_a/03.jpg` score low for the same reason.
- **Face clusters.** At distance 0.8 each fictional person has one main cluster (A and C eleven frames, D nine, E
  eight, B seven, the group shot counted in B's and E's), and no cluster mixes two people. Two pairs of dark crime
  stills sit apart (B's detective and drug deal, E's heist and getaway), and D's blindfolded hostage alone. Among the
  photos, the first handball player's three frames, the second's two, the volleyball player's two and the skier's
  three each form a cluster (the third handball frame, in another kit, may be a clustering error; it is the curator's
  real output). At 0.8 five crowd faces behind `photos/handball_a/03.jpg` merge into one cluster, also real output.
- **Watermarks.** The deliberate "SAMPLE ©" frame and the photographer's credit along the bottom of both volleyball
  photos and of `photos/handball_b/02.jpg` are cut away by a detected crop, and the frames pass on the crop. The
  photo banner reject holds an overlay no 15% edge cut removes, so it is rejected on that (`crop:overlay`). Weaker
  hits (`photos/handball_a/02.jpg`, `personD/D_action_film.jpg`, `personE/E_locker_room.jpg`) are below the
  detector's confidence line and change nothing.
- **Rejects.** Both blurred frames fail the sharpness gate, both low-resolution frames the resolution gate, and the
  synthetic banner the aspect ratio. `personA/A_cafe.jpg` and `rejects/A_cafe_neardup.jpg` are a near-duplicate
  pair, as are `photos/skier/02.jpg` and its copy; one of each pair is marked the duplicate and left out of the keep
  set (on this run curator kept the near-duplicate copy of A's café frame, which scored a hair higher).

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

- **The photographs** under `photos/`: CC0, as PD12M records each one; derived frames are CC0 too. No
  attribution is required; the institution is named above as a courtesy.
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
