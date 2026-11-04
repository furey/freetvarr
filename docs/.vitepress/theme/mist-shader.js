export const MIST_FRAG = `precision mediump float;
uniform vec2 o;uniform float b;uniform vec2 f;uniform float s;uniform float t;uniform vec3 c1;uniform vec3 c2;uniform float k;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*n(p);p=p*2.03+17.;a*=.5;}return v;}
void main(){
vec2 p=(gl_FragCoord.xy-o)/s;float d=length(p);vec2 q=p*1.1;
vec2 w=vec2(fbm(q*.8+vec2(t*.011,-t*.007)),fbm(q*.8+vec2(5.2,1.3)+vec2(-t*.009,t*.013)));
float far=fbm(q+1.8*w+vec2(-t*.006,t*.004));
vec2 v=vec2(fbm(q*1.7+w*1.2+vec2(t*.017,t*.01)),fbm(q*1.7+vec2(8.3,2.8)-vec2(t*.012,-t*.015)));
float near=fbm(q*2.2+2.4*v-vec2(t*.02,-t*.008));
float i=exp(-d*1.9)*(.25+far*.55+near*near*.6)+exp(-d*d*5.)*.3;
i*=smoothstep(-1.,-.2,dot(p,f))*smoothstep(0.,b,gl_FragCoord.y);
vec3 c=mix(c1,c2,smoothstep(.35,.75,near*.6+far*.5));
float a=clamp(i*k,0.,1.);
gl_FragColor=vec4(c*a,a);}`

export const MIST_VERT = 'attribute vec2 v;void main(){gl_Position=vec4(v,0.,1.);}'
