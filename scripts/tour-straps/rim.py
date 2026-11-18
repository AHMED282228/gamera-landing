# Обод заднего колеса: край светлого обода против тёмной шины, лучами; подгонка эллипса.
import numpy as np, json
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates
im=np.asarray(Image.open(r'C:\Users\AHMED\Desktop\VideoWeb-new\public\photos\tour-c-2752.webp').convert('RGB')).astype(float)
L=gaussian_filter(0.299*im[...,0]+0.587*im[...,1]+0.114*im[...,2],0.9)
def fit(P):
    x,y=P[:,0],P[:,1]; D=np.c_[x*x,x*y,y*y,x,y,np.ones_like(x)]
    _,_,vt=np.linalg.svd(D); a,b,c,d,e,f=vt[-1]
    M=np.array([[a,b/2],[b/2,c]]); x0=np.linalg.solve(2*M,[-d,-e]); k=-(f+d*x0[0]/2+e*x0[1]/2)
    w,V=np.linalg.eigh(M/k); return x0,1/np.sqrt(w),V
def rays(cx,cy,ax,ay,r0,r1,sign,step=3,skip=()):
    P=[];A=[]
    for ang in range(0,360,step):
        if any(lo<=ang<=hi for lo,hi in skip): continue
        t=np.radians(ang); rs=np.linspace(r0,r1,200)
        xs=cx+rs*ax*np.cos(t); ys=cy+rs*ay*np.sin(t)
        v=map_coordinates(L,[ys,xs],order=1); d=np.gradient(v)
        k=int(np.argmin(d) if sign<0 else np.argmax(d))
        if abs(d[k])<0.08: continue
        P.append((xs[k],ys[k])); A.append(ang)
    return np.array(P),np.array(A)
# 1) обод: снаружи обода — тёмная шина: яркость падает (знак −); нормированный радиус 0.8–1.2
P,A=rays(1340,960,48,81.5,0.82,1.18,-1)
c,ax,V=fit(P)
for it in range(3):
    L2=(P-c)@V; d=np.sqrt((L2[:,0]/ax[0])**2+(L2[:,1]/ax[1])**2); keep=np.abs(d-1)<0.04
    c,ax,V=fit(P[keep])
ang=np.degrees(np.arctan2(V[1,0],V[0,0]))
print(f'обод: центр ({c[0]:.1f},{c[1]:.1f}) полуоси {ax[0]:.1f} {ax[1]:.1f}, большая ось под {ang:.1f}°; точек {keep.sum()}/{len(P)}')
# ступица: самый светлый маленький кружок у центра
sub=L[935:975,1335:1370]; j=np.unravel_index(np.argmax(gaussian_filter(sub,2)),sub.shape)
print('ступица ~', 1335+j[1], 935+j[0])
json.dump(dict(c=c.tolist(),ax=ax.tolist(),V=V.tolist()),open('rim.json','w'))
