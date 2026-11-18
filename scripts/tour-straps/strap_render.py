# Ремни через колёса как настоящие: картинка-слой по пикселям кадра c (2752×1548).
#   python -I -X utf8 strap_render.py  → strap-rear.png, strap-front.png (RGBA, вырез) и boxes.json
import numpy as np, json
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, binary_dilation, binary_closing, binary_fill_holes, distance_transform_edt
SRC=r'C:\Users\AHMED\Desktop\VideoWeb-new\public\photos\tour-c-2752.webp'
G=json.load(open('geo.json'))
im=np.asarray(Image.open(SRC).convert('RGB')).astype(float)
L=gaussian_filter(0.299*im[...,0]+0.587*im[...,1]+0.114*im[...,2],0.8)
S=gaussian_filter(im.max(-1)-im.min(-1),0.8)
EDGE={'rear':[(1200,948),(1250,955),(1270,962),(1292,968),(1420,982),(1430,985),(1450,1003),(1470,1005),(1520,1009)],
      'front':[(930,858),(1000,866),(1020,873),(1040,889),(1060,897),(1110,906)]}
BOX={'rear':(1225,815,1500,1125),'front':(915,750,1090,940)}
SS=3   # суперсэмплинг
D_R=400/350  # крюк в 40 см от пятна контакта, в радиусах шины
for name in ('rear','front'):
    g=G[name]; c=np.array(g['c']); v=np.array(g['v']); l=np.array(g['l']); t=np.array(g['t']); T=g['T']; w=g['w']
    x0,y0,x1,y1=BOX[name]; Wd,Hd=x1-x0,y1-y0
    # маска кузова (заслоняет): серое, светлее арки, выше низа кузова, вне диска шины
    ys,xs=np.mgrid[y0:y1,x0:x1]
    edge=np.interp(xs[0],[p[0] for p in EDGE[name]],[p[1] for p in EDGE[name]])
    E=np.array(edge)[None,:]
    rel=np.stack([xs-c[0],ys-c[1]],-1)
    Minv=np.linalg.inv(np.array([l,v]).T)            # координаты в (назад, вниз)
    q=rel@Minv.T; inside_tire=(q[...,0]**2+q[...,1]**2)<=1.02
    body=(L[y0:y1,x0:x1]>12)&(S[y0:y1,x0:x1]<45)&(ys<E)&(~inside_tire)
    body=binary_dilation(body,iterations=1)
    # дыры в маске кузова (тёмная жабра, щели порога) — тоже кузов: иначе в окне и на
    # ремне видны пятна и полосы. Закрытие — с полем, чтобы не съесть край выреза.
    pb=np.pad(body,6); pb=binary_fill_holes(binary_closing(pb,iterations=4))[6:-6,6:-6]
    body=pb&(ys<E)&(~inside_tire)
    # точки ленты: ψ — угол на колесе (0 — пятно контакта, 90 — назад, 180 — верх)
    def P(psi,s):  # точка протектора: ψ, доля ширины протектора s (0 — наружная боковина)
        return c+np.sin(psi)*l+np.cos(psi)*v+s*T*t
    def W2I(X,Y,s):  # точка в плоскости колеса: X — назад, Y — высота (в радиусах)
        return c+X*l+(1-Y)*v+s*T*t
    # касание: угол над горизонталью для крюка на D_R
    beta=np.arccos(1/np.hypot(D_R,1)); a0=np.arctan2(-1,D_R)
    ang=a0+beta                       # от горизонтали «назад», вверх
    psi_r=np.pi/2+ang; psi_f=3*np.pi/2-ang
    sil=np.radians(g['sil'])
    s_c=0.5; hw=w/2/T
    # путь: крюк спереди → касание спереди → дуга через верх → касание сзади → крюк сзади
    path=[]
    for k in np.linspace(0,1,24): path.append(('run', (-D_R+( -np.cos(ang)+D_R)*k, 0+(1+np.sin(ang))*k)))
    for psi in np.linspace(psi_f,psi_r,120): path.append(('arc',psi))
    for k in np.linspace(0,1,24): path.append(('run', (np.cos(ang)+(D_R-np.cos(ang))*k, (1+np.sin(ang))*(1-k))))
    def pt(item,s):
        kind,val=item
        return P(val,s) if kind=='arc' else W2I(val[0],val[1],s)
    def up_normal(item):
        kind,val=item
        return max(0.0,-np.cos(val)) if kind=='arc' else 0.25
    def tire_hidden(item,s):
        kind,val=item
        if kind=='arc':
            d=np.degrees(val)%360; return not (g['sil'][0]<d<g['sil'][1])
        p=W2I(val[0],val[1],s)-c; qq=Minv@p; return (qq[0]**2+qq[1]**2)<1.0
    # растр
    big=Image.new('RGBA',(Wd*SS,Hd*SS),(0,0,0,0)); dr=ImageDraw.Draw(big)
    vis=Image.new('L',(Wd*SS,Hd*SS),0); dv=ImageDraw.Draw(vis)
    full=Image.new('L',(Wd*SS,Hd*SS),0); df=ImageDraw.Draw(full)   # ремень целиком, со скрытым за шиной
    BASE=np.array([214,170,36],float)
    NS=8
    for i in range(len(path)-1):
        A,B=path[i],path[i+1]
        for j in range(NS):
            sa=s_c-hw+2*hw*j/NS; sb=s_c-hw+2*hw*(j+1)/NS
            quad=[pt(A,sa),pt(A,sb),pt(B,sb),pt(B,sa)]
            poly=[((x-x0)*SS,(y-y0)*SS) for x,y in quad]
            df.polygon(poly,fill=255)
            if tire_hidden(A,(sa+sb)/2) and tire_hidden(B,(sa+sb)/2): continue
            light=(0.5+0.4*up_normal(A))
            weave=1+0.06*((j%2)*2-1)
            hem=0.78 if j in (0,NS-1) else 1.0
            col=np.clip(BASE*light*weave*hem,0,255).astype(int)
            dr.polygon(poly,fill=tuple(col)+(255,))
            dv.polygon(poly,fill=255)
    # крюки и храповик
    def metal_box(ctr,dirv,length,width,col):
        d=dirv/np.linalg.norm(dirv); n=np.array([-d[1],d[0]])
        pts=[ctr+d*length/2+n*width/2,ctr+d*length/2-n*width/2,ctr-d*length/2-n*width/2,ctr-d*length/2+n*width/2]
        dr.polygon([((x-x0)*SS,(y-y0)*SS) for x,y in pts],fill=col); dv.polygon([((x-x0)*SS,(y-y0)*SS) for x,y in pts],fill=255); df.polygon([((x-x0)*SS,(y-y0)*SS) for x,y in pts],fill=255)
        hl=[ctr+d*length/2+n*width*0.15,ctr-d*length/2+n*width*0.15]
        dr.line([((x-x0)*SS,(y-y0)*SS) for x,y in hl],fill=(190,192,196,255),width=SS)
    ancF=W2I(-D_R,0,s_c); ancR=W2I(D_R,0,s_c)
    tanR=W2I(np.cos(ang),1+np.sin(ang),s_c)
    scale=np.linalg.norm(v)/350.0      # px на мм
    metal_box(ancF,W2I(-D_R+0.1,0,s_c)-ancF,14*scale*2.2,9*scale*2.2,(92,94,98,255))
    metal_box(ancR,W2I(D_R-0.1,0,s_c)-ancR,14*scale*2.2,9*scale*2.2,(92,94,98,255))
    rat=ancR+(tanR-ancR)*0.28
    metal_box(rat,tanR-ancR,62*scale,40*scale,(70,72,76,255))
    small=big.resize((Wd,Hd),Image.LANCZOS)
    rgba=np.asarray(small).astype(float); a=rgba[...,3]/255
    bodyf=gaussian_filter(body.astype(float),0.6)
    # протектор целиком (цилиндр шины: от наружной боковины на всю ширину T вглубь)
    tread=np.zeros((Hd,Wd),bool)
    for sv in np.linspace(0,1,24):
        qq=(rel-sv*T*t)@Minv.T; tread|=(qq[...,0]**2+qq[...,1]**2)<=1.0
    # окно «рентгена»: кузов прозрачен над скрытой частью шины и вокруг ремня
    hidden=(a>0.3)&body
    win=(tread&body)|(binary_dilation(hidden,iterations=7))
    win=gaussian_filter(win.astype(float),2.2)*bodyf
    win=np.clip(win*1.2,0,1)
    # за кузовом: шина — тёмная резина со светотенью и канавками протектора; рядом — тёмная арка
    qn=rel@Minv.T                        # (назад, вниз) в радиусах для наружной боковины
    # для каждой точки протектора — доля ширины s и угол ψ: перебор s, ближайшая окружность
    best_s=np.full((Hd,Wd),-1.0); best_psi=np.zeros((Hd,Wd))
    for sv in np.linspace(0,1,48):
        qq=(rel-sv*T*t)@Minv.T; rr=np.hypot(qq[...,0],qq[...,1])
        on=(np.abs(rr-1)<0.035)
        best_s=np.where(on,sv,best_s); best_psi=np.where(on,np.arctan2(qq[...,0],qq[...,1]),best_psi)
    rubber=np.full((Hd,Wd,3),[11,12,16.0])
    tr=tread
    upl=np.clip(-np.cos(best_psi),0,1)
    shade=0.75+0.6*upl
    groove=np.zeros((Hd,Wd))
    for gs in (0.22,0.42,0.62,0.82):
        groove=np.maximum(groove,np.exp(-((best_s-gs)/0.025)**2)*(best_s>=0))
    rub=np.array([26,26,29.0])[None,None,:]*shade[...,None]*(1-0.45*groove[...,None])
    rubber=np.where((tr&(best_s>=0))[...,None],rub,np.where(tr[...,None],np.array([22,22,25.0]),rubber))
    photo=im[y0:y1,x0:x1]
    ghost=0.14   # от панели остаётся отблеск
    tint=np.array([0.92,0.97,1.06])
    winrgb=(rubber*(1-ghost)+photo*ghost)*tint
    # блик по краю окна — кромка прозрачной панели
    rim=np.clip(gaussian_filter(win,0.8)-gaussian_filter(win,2.4),0,1)*2.2
    winrgb=winrgb*(1-rim[...,None]*0.12)+np.array([200,215,235.0])*rim[...,None]*0.12   # едва заметна: колесо не обводится светом
    out=np.zeros((Hd,Wd,4))
    out[...,:3]=winrgb; out[...,3]=win
    # ремень поверх (в окне — чуть приглушён: виден сквозь панель)
    sa=a*(1-0.08*bodyf)
    out[...,:3]=out[...,:3]*(1-sa[...,None])*np.where(out[...,3:]>0,1,1)+rgba[...,:3]*sa[...,None] if False else out[...,:3]
    A2=out[...,3:]; rgb2=out[...,:3]
    A1=sa[...,None]; rgb1=rgba[...,:3]
    Ao=A1+A2*(1-A1)
    rgbo=np.where(Ao>0,(rgb1*A1+rgb2*A2*(1-A1))/np.maximum(Ao,1e-6),0)
    # тень у кромок ремня на шине (видимые места)
    halo=np.clip(gaussian_filter(a,1.2)-a,0,1)*(1-bodyf)*0.5
    Ao2=Ao+halo[...,None]*(1-Ao); rgbo=np.where(Ao2>0,rgbo*Ao/np.maximum(Ao2,1e-6),0)
    # затемнение сайта в этом месте (мягкий просвет вокруг колеса) — уже в слое
    hw,hh=g['box_hw'],g['box_hh']; bc=np.array(g['box_c'])
    rr=np.sqrt(((xs-bc[0])/(hw*2.3))**2+((ys-bc[1])/(hh*1.75))**2)
    # в окне «рентгена» затемнения нет; на ремне за краем окна оно возвращается плавно
    dist=distance_transform_edt(~(win>0.5))          # px от края окна
    fade=np.clip(1-dist/24,0,1); fade=fade*fade*(3-2*fade)
    keep=np.maximum(win,fade)
    dimA=0.66*np.clip((rr-0.35)/0.65,0,1)*(1-keep)
    rgbo=rgbo*(1-dimA[...,None])
    outimg=np.concatenate([rgbo,Ao2*255],-1).clip(0,255).astype(np.uint8)
    Image.fromarray(outimg).save(f'strap-{name}.png')
    np.save(f'body-{name}.npy',body)
    np.save(f'vis-{name}.npy',np.asarray(vis)); np.save(f'full-{name}.npy',np.asarray(full))
    print(name,'вырез',BOX[name],'касание ψ сзади %.1f° спереди %.1f°'%(np.degrees(psi_r),np.degrees(psi_f)),'крюки',np.round(ancF,1),np.round(ancR,1))
json.dump(BOX,open('boxes.json','w'))
