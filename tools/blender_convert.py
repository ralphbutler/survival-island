# Usage: /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/blender_convert.py -- <out_dir> <file.fbx|file.blend> ...
#   env TEX=<png> points every image at that texture (Quaternius people: their .blend paths are broken); NAME=<out name>.
# Blender batch converter -> .glb.  Args after "--": <out_dir> <file.fbx|file.blend> ...
# Forces every material fully opaque (FBX import was zeroing alpha -> invisible models).
import bpy, sys, os
argv = sys.argv[sys.argv.index("--") + 1:]
out_dir, files = argv[0], argv[1:]
os.makedirs(out_dir, exist_ok=True)

def principled_from_diffuse():
    # Old Diffuse BSDF materials don't survive glTF export; rebuild them as Principled BSDF.
    for m in bpy.data.materials:
        nt = m.node_tree
        if not nt:
            continue
        for d in [n for n in nt.nodes if n.type == 'BSDF_DIFFUSE']:
            p = nt.nodes.new('ShaderNodeBsdfPrincipled')
            p.inputs['Roughness'].default_value = 1.0
            p.inputs['Base Color'].default_value = d.inputs['Color'].default_value
            for l in list(d.inputs['Color'].links):
                nt.links.new(l.from_socket, p.inputs['Base Color'])
            for l in list(d.outputs[0].links):
                nt.links.new(p.outputs[0], l.to_socket)
            nt.nodes.remove(d)

def make_opaque():
    principled_from_diffuse()
    for m in bpy.data.materials:
        m.diffuse_color[3] = 1.0
        if m.use_nodes and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    a = n.inputs.get('Alpha')
                    if a is not None:
                        for link in list(a.links):
                            m.node_tree.links.remove(link)
                        a.default_value = 1.0
        for attr in ('blend_method', 'surface_render_method'):
            if hasattr(m, attr):
                try: setattr(m, attr, 'OPAQUE' if attr == 'blend_method' else 'DITHERED')
                except Exception: pass

for f in files:
    if f.endswith('.blend'):
        bpy.ops.wm.open_mainfile(filepath=f)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=f)
    make_opaque()
    tex = os.environ.get('TEX')   # optional: point every image at this texture file (fixes broken paths)
    if tex:
        for i in bpy.data.images:
            if i.type == 'IMAGE':
                i.filepath = tex
                i.reload()
    imgs = [(i.name, os.path.basename(i.filepath), i.has_data or bool(i.packed_file)) for i in bpy.data.images if i.type == 'IMAGE']
    name = os.environ.get('NAME') or os.path.splitext(os.path.basename(f))[0].replace(" ", "_")
    out = os.path.join(out_dir, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True)
    print(f"OK {name}.glb actions={[a.name.split('|')[-1] for a in bpy.data.actions][:14]} images={imgs}")
