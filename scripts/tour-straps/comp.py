import numpy as np, json, sys
from PIL import Image
B=json.load(open('boxes.json'))
src=Image.open(r'C:\Users\AHMED\Desktop\VideoWeb-new\public\photos\tour-c-2752.webp').convert('RGB')
def comp(name,s):
    x0,y0,x1,y1=B[name]; base=src.crop((x0,y0,x1,y1))
    a=(np.asarray(base).astype(float)/255)**(1/1.5)*255   # чуть светлее для просмотра
    base=Image.fromarray(a.astype(np.uint8)).convert('RGBA')
    ov=Image.open(f'strap-{name}.png').convert('RGBA')
    out=Image.alpha_composite(base,ov).convert('RGB')
    return out.resize((int(out.width*s),int(out.height*s)),Image.LANCZOS)
A=comp('rear',2.2); Bf=comp('front',2.2)
o=Image.new('RGB',(A.width+Bf.width+6,max(A.height,Bf.height)),(255,255,255)); o.paste(A,(0,0)); o.paste(Bf,(A.width+6,0)); o.save(sys.argv[1] if len(sys.argv)>1 else 'comp.png'); print(o.size)
