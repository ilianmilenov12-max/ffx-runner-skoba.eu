"""Изнася world.blend и cars.blend към assets/*.glb.

Пуска се през Blender:
    blender -b source/blender_conversion/world.blend \
            --python tools/export_gltf.py -- assets/world.glb

Две неща се оправят по пътя:
  * пътищата към текстурите в .blend сочат //../images/, а картинките са в
    images/ до самия файл — без релинк glTF-ът излиза без текстури;
  * където tools/alpha/ има същата текстура с върната прозрачност (виж
    fix_alpha.sh), се ползва тя;
  * където tools/upscaled/ има увеличената ×4 версия (tools/upscale.py), се
    ползва тя преди всичко. FFX_NO_UPSCALE=1 го изключва.
"""
import bpy, os, sys

out = sys.argv[sys.argv.index('--') + 1]
project = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
alpha_dir = os.path.join(project, 'tools', 'alpha')
upscaled_dir = os.path.join(project, 'tools', 'upscaled')
use_upscaled = not os.environ.get('FFX_NO_UPSCALE')
blend_dir = os.path.dirname(bpy.data.filepath)

relinked = restored = upscaled = 0
for image in bpy.data.images:
    if image.name == 'Render Result':
        continue
    base = os.path.basename(image.filepath)
    stem = os.path.splitext(base)[0]
    if use_upscaled:
        found = [os.path.join(upscaled_dir, stem + ext) for ext in ('.png', '.jpg')]
        found = [f for f in found if os.path.exists(f)]
        if found:
            image.filepath = found[0]
            image.reload()
            upscaled += 1
            continue
    with_alpha = os.path.join(alpha_dir, base)
    if os.path.exists(with_alpha):
        image.filepath = with_alpha
        image.reload()
        restored += 1
        continue
    if not os.path.exists(bpy.path.abspath(image.filepath)):
        candidate = os.path.join(blend_dir, 'images', base)
        if os.path.exists(candidate):
            image.filepath = '//images/' + base
            image.reload()
            relinked += 1

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_yup=True,
    use_selection=False,
    export_cameras=False,
    export_lights=False,
)
print(f'ИЗНЕСЕНО {out} ({os.path.getsize(out)} байта) '
      f'· релинкнати {relinked} · с върната прозрачност {restored} · увеличени {upscaled}')
