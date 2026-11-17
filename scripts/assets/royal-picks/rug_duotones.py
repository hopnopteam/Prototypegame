# Duotone rug fields from Poly Haven fabric scans: the scan's light and shade mapped between two colours, the way the
# game uses its detail layers (a photo's texture over our own palette).
from PIL import Image, ImageOps
import sys
src = '/tmp/claude-0/hunt/phtex/'; out = '/tmp/claude-0/hunt/www/rugtex/'
def duo(name, dark, light, file, contrast=1.0, size=512):
    im = Image.open(src + name + '_diff_1k.jpg').convert('L').resize((size, size), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=1)
    if contrast != 1.0: im = im.point(lambda v: max(0, min(255, int((v - 128) * contrast + 128))))
    ImageOps.colorize(im, dark, light).save(out + file + '.jpg', quality=88)
duo('quatrefoil_jacquard_fabric', '#4A0C14', '#C23A3A', 'crimson_quatrefoil', 2.2)
duo('floral_jacquard', '#5A1A24', '#D8B26A', 'gold_damask', 1.6)
duo('velour_velvet', '#0E1E4A', '#3A5BA8', 'sapphire_velvet', 1.4)
duo('scuba_suede', '#6E4A2C', '#C79A6A', 'camel_suede', 1.8)
duo('faux_fur_geometric', '#5E3B5C', '#D9B7CE', 'mauve_plush', 1.2)
duo('curly_teddy_natural', '#B9A88E', '#FBF4E6', 'ivory_fleece', 1.0)
duo('poly_wool_herringbone', '#8C7550', '#EBDDBB', 'champagne_herringbone', 1.6)
duo('floral_jacquard', '#0C1A3A', '#8EA6D8', 'sapphire_damask', 1.6)
duo('quatrefoil_jacquard_fabric', '#0F3A2E', '#C9A24A', 'emerald_quatrefoil', 2.2)
duo('velour_velvet', '#3A0A1E', '#8C1E3E', 'claret_velvet', 1.4)
print('ok')
