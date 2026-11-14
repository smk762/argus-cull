# Argus Cull demo set: provenance

The 29 images in this demo are **synthetic**, generated on 2026-11-14 for this demo. The four people in them
are **fictional**: each was described in words, not taken from photos, and none depicts or imitates a real
person. All four are written as adults aged 35 to 47, and every frame was checked by eye to read clearly as an
adult. Content runs from bland to mildly suggestive (one-piece swimsuits, a sports crop top, a cowl-neck slip
dress): no nudity, no lingerie, no sexualised posing.

The scores, ages and verdicts on the page are what argus-curator recorded when it scanned this set. Nothing was
edited by hand.

## Folders

| Folder | What is in it |
|---|---|
| `personA/` to `personD/` | the four fictional people, one folder each: everyday scenes, mildly suggestive frames, and scenes chosen to hit the setting cohorts (classroom, library, gymnasium, playground, locker room) with an adult in them |
| `mixed/` | a group shot of A and B |
| `rejects/` | frames made to fail a check: blur, low resolution, aspect ratio, a near duplicate, and a watermark |

## Recipe

1. **Text render.** SDXL text-to-image, checkpoint **CyberRealistic XL Desire v2.0** (by Cyberdelia),
   DPM++ 2M SDE Karras, 30 steps, CFG 5.0, 832x1216 (portrait) or 1216x832 (landscape), in diffusers.
   Two seeds were rendered per scene and the better one was kept.
2. **Identity pass.** Each kept render was re-rendered with **InstantID** (InstantX; IdentityNet ControlNet
   and IP-Adapter, same checkpoint and sampler), so each person keeps one face across scenes. The face
   embedding comes from one synthetic reference portrait per person, and the head pose from the scene's own
   text render. ControlNet and IP-Adapter scale 0.8, 30 steps, CFG 5.0.
3. **Group shot.** A text render of two people; each of the two largest faces was re-rendered with InstantID
   on a 1024 px crop and blended back with a feathered mask.
4. **Rejects**, made from generated frames:
   - blur: Gaussian blur, radius 8;
   - low resolution: downscaled to 160 px wide;
   - aspect ratio: a 5:1 crop (2736x547) of an upscaled render, so only the aspect ratio fails;
   - near duplicate: the same identity render repeated at CFG 5.3;
   - watermark: a semi-transparent "SAMPLE (c)" text box drawn into the bottom-right corner.
   The blur and watermark rejects are text renders only, with no identity pass.
5. **Clean-up.** Saved as JPEG from fresh pixel buffers, so there is no EXIF, XMP or generator metadata.
   The demo serves WebP copies made from those files, again without metadata.

Every prompt ends with "professional photograph, natural skin texture, realistic, 85mm lens, sharp focus,
soft light". The negative prompt excludes nudity, lingerie, sexualised terms, real or famous people, and
any child, teen or childlike look, as well as brands, logos and watermarks.

## People

- **Person A:** a fictional 38 year old Black woman, short natural curly black hair, small gold hoop earrings.
- **Person B:** a fictional 47 year old East Asian man, greying temples, thin rectangular glasses.
- **Person C:** a fictional 44 year old South Asian woman, long dark hair with grey streaks in a low bun.
- **Person D:** a fictional 35 year old Hispanic man, short dark wavy hair, full short dark beard.

## Images

| File | Intended category | Scene (after the person's description) |
|---|---|---|
| `personA/A_cafe.jpg` | bland | mustard cardigan, sitting in a cosy cafe holding a coffee cup |
| `personA/A_street.jpg` | bland | camel trench coat, side profile, on a city street |
| `personA/A_office.jpg` | bland | white blouse and dark blazer, smiling, in a bright modern office |
| `personA/A_beach.jpg` | suggestive | modest black one-piece swimsuit, on a sandy beach, waist-up |
| `personA/A_gym.jpg` | suggestive | grey sports crop top and black leggings, in a gym, waist-up |
| `personA/A_pool.jpg` | suggestive | modest black one-piece swimsuit with wide straps, in a resort pool, waist-up |
| `personA/A_locker_room.jpg` | cohort scene: locker room | plain blue football jersey and long shorts, on a bench in a locker room, fully clothed |
| `personB/B_office.jpg` | bland | white shirt and grey tie, head and shoulders, in a modern office |
| `personB/B_kitchen.jpg` | bland | green apron over a grey t-shirt, chopping vegetables in a home kitchen |
| `personB/B_park.jpg` | bland | navy quilted jacket, walking in a city park, autumn |
| `personB/B_teacher_classroom.jpg` | cohort scene: classroom | adult teacher at a whiteboard in an empty classroom |
| `personC/C_park.jpg` | bland | rust coloured coat, smiling, in a park |
| `personC/C_kitchen.jpg` | bland | cream knit sweater, holding a mug in a home kitchen |
| `personC/C_cafe.jpg` | bland | mustard scarf and denim jacket, by a cafe window |
| `personC/C_librarian_library.jpg` | cohort scene: library | adult librarian between tall bookshelves, holding books |
| `personC/C_pool.jpg` | suggestive | modest navy one-piece swimsuit with wide straps, waist-deep in a resort pool |
| `personC/C_evening.jpg` | suggestive | emerald satin slip dress with a high cowl neckline, restaurant terrace at dusk |
| `personC/C_yoga.jpg` | suggestive | fitted grey sports top and black leggings, in a yoga studio |
| `personD/D_street.jpg` | bland | black denim jacket, on a city street |
| `personD/D_cafe.jpg` | bland | white linen shirt, at a cafe table with a laptop |
| `personD/D_coach_gymnasium.jpg` | cohort scene: gymnasium | adult sports coach with a whistle and clipboard in an empty school gymnasium |
| `personD/D_playground_bench.jpg` | cohort scene: playground | grey hoodie and jeans, alone on a bench beside an empty playground |
| `personD/D_gym.jpg` | suggestive | black athletic tank top, holding a dumbbell in a gym |
| `mixed/AB_group_cafe.jpg` | bland (group, A and B) | two adult colleagues side by side, smiling, in a bright cafe |
| `rejects/A_cafe_neardup.jpg` | reject: near duplicate of A_cafe | as A_cafe, at CFG 5.3 |
| `rejects/B_office_blurred.jpg` | reject: blur | as B_office, then Gaussian blur |
| `rejects/C_kitchen_lowres.jpg` | reject: low resolution | as C_kitchen, downscaled to 160 px wide |
| `rejects/D_promenade_banner.jpg` | reject: aspect ratio | small in frame on a beach promenade at sunset, 5:1 crop |
| `rejects/D_street_watermark.jpg` | reject: watermark | as D_street, with a "SAMPLE (c)" box bottom-right |

The intended category is what each frame was made to show, not what the curator decided. The page shows the
curator's own readings, and some differ: the group shot came out of the text render with a small, garbled
stock-photo-style credit mark on the man's collar, which the watermark check found; the blur reject passes the hard
quality gate and falls out of the keep set on its score instead (0.599, under the default 0.6); and the watermark frame is cropped (the curator's `crops: detect`)
rather than rejected.

## Left out during generation

Each scene was rendered with two seeds. Frames were dropped when NudeNet read a clothed or shirtless frame as
exposed, when the model drew a sportswear logo or a jersey number, or when a pose or neckline was more than
mildly suggestive.

## Licences

- **CyberRealistic XL Desire v2.0:** CreativeML Open RAIL-M, as declared on the author's model card.
  Generated outputs may be used, including in public demos, subject to the licence's use restrictions
  (no impersonation of real people, no harmful content, and so on). This set keeps to them: fictional adults
  and safe-for-work scenes.
- **InstantID** (InstantX; pipeline code, IdentityNet ControlNet and IP-Adapter weights): Apache-2.0.
- **InsightFace `antelopev2`** (the face encoder InstantID uses): InsightFace releases its pretrained weights
  for **non-commercial research use only**. They were used only to make this non-commercial demo set.
- **DejaVu Sans** (the watermark font): Bitstream Vera licence, a permissive free-font licence.
