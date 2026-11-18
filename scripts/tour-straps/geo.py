# Геометрия колёс кадра c (px кадра 2752): шина — эллипс; сопряжённые полудиаметры
# «вниз» (v, к пятну контакта) и «назад» (l, вдоль платформы) — аффинный образ круга.
import numpy as np, json
def conj(c, a, U, b, W, lon):
    U=np.array(U,float); W=np.array(W,float); lon=np.array(lon,float); lon/=np.linalg.norm(lon)
    s=np.arctan2((lon@W)/b, (lon@U)/a)        # параметр точки эллипса по направлению «назад»
    l=a*np.cos(s)*U+b*np.sin(s)*W
    sv=s-np.pi/2; v=a*np.cos(sv)*U+b*np.sin(sv)*W
    if v[1]<0: v=-v
    return np.array(c,float), v, l
R=json.load(open('rim.json')); c=np.array(R['c']); ax=np.array(R['ax']); V=np.array(R['V'])
i=int(np.argmax(ax)); U=V[:,i]; U=U if U[1]>0 else -U; W=np.array([U[1],-U[0]])
K=1.31                                         # шина 275/35 R20 к закраине обода 20"
rear=conj(c, ax[i]*K, U, ax[1-i]*K, W, (0.892,0.452))
front=conj((982.9,847.0), 71.3, (0.106,0.994), 30.1, (0.994,-0.106), (0.977,0.212))
t=np.array([0.996,-0.089])
out={}
for name,(cc,v,l),T,w in (('rear',rear,72,13.1),('front',front,45,9.2)):
    # силуэт протектора: где касательная эллипса ∥ оси t
    f=lambda p: np.cross if False else None
    ps=np.radians(np.arange(0,360,0.1)); dE=np.outer(np.cos(ps),l)-np.outer(np.sin(ps),v)
    cr=dE[:,0]*t[1]-dE[:,1]*t[0]; z=np.where(np.diff(np.sign(cr))!=0)[0]
    sil=sorted(float(np.degrees(ps[k])) for k in z)
    out[name]=dict(c=cc.tolist(),v=v.tolist(),l=l.tolist(),t=t.tolist(),T=T,w=w,sil=sil)
    print(name,'центр',np.round(cc,1),'вниз',np.round(v,1),'|v|',round(float(np.linalg.norm(v)),1),'назад',np.round(l,1),'силуэт протектора ψ',[round(x,1) for x in sil],
          'контакт',np.round(cc+v,1),'верх',np.round(cc-v,1))
json.dump(out,open('geo.json','w'))
