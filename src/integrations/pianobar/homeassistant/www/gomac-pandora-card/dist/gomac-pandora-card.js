var wt=Object.defineProperty;var Ct=Object.getOwnPropertyDescriptor;var M=(o,t,e,i)=>{for(var s=i>1?void 0:i?Ct(t,e):t,r=o.length-1,n;r>=0;r--)(n=o[r])&&(s=(i?n(t,e,s):n(s))||s);return i&&s&&wt(t,e,s),s};var k=globalThis,L=k.ShadowRoot&&(k.ShadyCSS===void 0||k.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,B=Symbol(),ot=new WeakMap,w=class{constructor(t,e,i){if(this._$cssResult$=!0,i!==B)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o,e=this.t;if(L&&t===void 0){let i=e!==void 0&&e.length===1;i&&(t=ot.get(e)),t===void 0&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),i&&ot.set(e,t))}return t}toString(){return this.cssText}},rt=o=>new w(typeof o=="string"?o:o+"",void 0,B),q=(o,...t)=>{let e=o.length===1?o[0]:t.reduce((i,s,r)=>i+(n=>{if(n._$cssResult$===!0)return n.cssText;if(typeof n=="number")return n;throw Error("Value passed to 'css' function must be a 'css' function result: "+n+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+o[r+1],o[0]);return new w(e,o,B)},nt=(o,t)=>{if(L)o.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(let e of t){let i=document.createElement("style"),s=k.litNonce;s!==void 0&&i.setAttribute("nonce",s),i.textContent=e.cssText,o.appendChild(i)}},F=L?o=>o:o=>o instanceof CSSStyleSheet?(t=>{let e="";for(let i of t.cssRules)e+=i.cssText;return rt(e)})(o):o;var{is:Tt,defineProperty:Pt,getOwnPropertyDescriptor:Ut,getOwnPropertyNames:Ot,getOwnPropertySymbols:Nt,getPrototypeOf:Rt}=Object,H=globalThis,at=H.trustedTypes,It=at?at.emptyScript:"",Mt=H.reactiveElementPolyfillSupport,C=(o,t)=>o,T={toAttribute(o,t){switch(t){case Boolean:o=o?It:null;break;case Object:case Array:o=o==null?o:JSON.stringify(o)}return o},fromAttribute(o,t){let e=o;switch(t){case Boolean:e=o!==null;break;case Number:e=o===null?null:Number(o);break;case Object:case Array:try{e=JSON.parse(o)}catch{e=null}}return e}},V=(o,t)=>!Tt(o,t),lt={attribute:!0,type:String,converter:T,reflect:!1,useDefault:!1,hasChanged:V};Symbol.metadata??=Symbol("metadata"),H.litPropertyMetadata??=new WeakMap;var m=class extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=lt){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){let i=Symbol(),s=this.getPropertyDescriptor(t,i,e);s!==void 0&&Pt(this.prototype,t,s)}}static getPropertyDescriptor(t,e,i){let{get:s,set:r}=Ut(this.prototype,t)??{get(){return this[e]},set(n){this[e]=n}};return{get:s,set(n){let l=s?.call(this);r?.call(this,n),this.requestUpdate(t,l,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??lt}static _$Ei(){if(this.hasOwnProperty(C("elementProperties")))return;let t=Rt(this);t.finalize(),t.l!==void 0&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(C("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(C("properties"))){let e=this.properties,i=[...Ot(e),...Nt(e)];for(let s of i)this.createProperty(s,e[s])}let t=this[Symbol.metadata];if(t!==null){let e=litPropertyMetadata.get(t);if(e!==void 0)for(let[i,s]of e)this.elementProperties.set(i,s)}this._$Eh=new Map;for(let[e,i]of this.elementProperties){let s=this._$Eu(e,i);s!==void 0&&this._$Eh.set(s,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){let e=[];if(Array.isArray(t)){let i=new Set(t.flat(1/0).reverse());for(let s of i)e.unshift(F(s))}else t!==void 0&&e.push(F(t));return e}static _$Eu(t,e){let i=e.attribute;return i===!1?void 0:typeof i=="string"?i:typeof t=="string"?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(t=>t(this))}addController(t){(this._$EO??=new Set).add(t),this.renderRoot!==void 0&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){let t=new Map,e=this.constructor.elementProperties;for(let i of e.keys())this.hasOwnProperty(i)&&(t.set(i,this[i]),delete this[i]);t.size>0&&(this._$Ep=t)}createRenderRoot(){let t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return nt(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(t=>t.hostConnected?.())}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach(t=>t.hostDisconnected?.())}attributeChangedCallback(t,e,i){this._$AK(t,i)}_$ET(t,e){let i=this.constructor.elementProperties.get(t),s=this.constructor._$Eu(t,i);if(s!==void 0&&i.reflect===!0){let r=(i.converter?.toAttribute!==void 0?i.converter:T).toAttribute(e,i.type);this._$Em=t,r==null?this.removeAttribute(s):this.setAttribute(s,r),this._$Em=null}}_$AK(t,e){let i=this.constructor,s=i._$Eh.get(t);if(s!==void 0&&this._$Em!==s){let r=i.getPropertyOptions(s),n=typeof r.converter=="function"?{fromAttribute:r.converter}:r.converter?.fromAttribute!==void 0?r.converter:T;this._$Em=s;let l=n.fromAttribute(e,r.type);this[s]=l??this._$Ej?.get(s)??l,this._$Em=null}}requestUpdate(t,e,i,s=!1,r){if(t!==void 0){let n=this.constructor;if(s===!1&&(r=this[t]),i??=n.getPropertyOptions(t),!((i.hasChanged??V)(r,e)||i.useDefault&&i.reflect&&r===this._$Ej?.get(t)&&!this.hasAttribute(n._$Eu(t,i))))return;this.C(t,e,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(t,e,{useDefault:i,reflect:s,wrapped:r},n){i&&!(this._$Ej??=new Map).has(t)&&(this._$Ej.set(t,n??e??this[t]),r!==!0||n!==void 0)||(this._$AL.has(t)||(this.hasUpdated||i||(e=void 0),this._$AL.set(t,e)),s===!0&&this._$Em!==t&&(this._$Eq??=new Set).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}let t=this.scheduleUpdate();return t!=null&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[s,r]of this._$Ep)this[s]=r;this._$Ep=void 0}let i=this.constructor.elementProperties;if(i.size>0)for(let[s,r]of i){let{wrapped:n}=r,l=this[s];n!==!0||this._$AL.has(s)||l===void 0||this.C(s,void 0,r,l)}}let t=!1,e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),this._$EO?.forEach(i=>i.hostUpdate?.()),this.update(e)):this._$EM()}catch(i){throw t=!1,this._$EM(),i}t&&this._$AE(e)}willUpdate(t){}_$AE(t){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&=this._$Eq.forEach(e=>this._$ET(e,this[e])),this._$EM()}updated(t){}firstUpdated(t){}};m.elementStyles=[],m.shadowRootOptions={mode:"open"},m[C("elementProperties")]=new Map,m[C("finalized")]=new Map,Mt?.({ReactiveElement:m}),(H.reactiveElementVersions??=[]).push("2.1.2");var Q=globalThis,ct=o=>o,D=Q.trustedTypes,dt=D?D.createPolicy("lit-html",{createHTML:o=>o}):void 0,ft="$lit$",g=`lit$${Math.random().toFixed(9).slice(2)}$`,gt="?"+g,kt=`<${gt}>`,b=document,U=()=>b.createComment(""),O=o=>o===null||typeof o!="object"&&typeof o!="function",X=Array.isArray,Lt=o=>X(o)||typeof o?.[Symbol.iterator]=="function",Y=`[ 	
\f\r]`,P=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,ht=/-->/g,ut=/>/g,y=RegExp(`>|${Y}(?:([^\\s"'>=/]+)(${Y}*=${Y}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),pt=/'/g,mt=/"/g,vt=/^(?:script|style|textarea|title)$/i,tt=o=>(t,...e)=>({_$litType$:o,strings:t,values:e}),_=tt(1),Qt=tt(2),Xt=tt(3),A=Symbol.for("lit-noChange"),h=Symbol.for("lit-nothing"),_t=new WeakMap,$=b.createTreeWalker(b,129);function yt(o,t){if(!X(o)||!o.hasOwnProperty("raw"))throw Error("invalid template strings array");return dt!==void 0?dt.createHTML(t):t}var Ht=(o,t)=>{let e=o.length-1,i=[],s,r=t===2?"<svg>":t===3?"<math>":"",n=P;for(let l=0;l<e;l++){let a=o[l],d,u,c=-1,p=0;for(;p<a.length&&(n.lastIndex=p,u=n.exec(a),u!==null);)p=n.lastIndex,n===P?u[1]==="!--"?n=ht:u[1]!==void 0?n=ut:u[2]!==void 0?(vt.test(u[2])&&(s=RegExp("</"+u[2],"g")),n=y):u[3]!==void 0&&(n=y):n===y?u[0]===">"?(n=s??P,c=-1):u[1]===void 0?c=-2:(c=n.lastIndex-u[2].length,d=u[1],n=u[3]===void 0?y:u[3]==='"'?mt:pt):n===mt||n===pt?n=y:n===ht||n===ut?n=P:(n=y,s=void 0);let f=n===y&&o[l+1].startsWith("/>")?" ":"";r+=n===P?a+kt:c>=0?(i.push(d),a.slice(0,c)+ft+a.slice(c)+g+f):a+g+(c===-2?l:f)}return[yt(o,r+(o[e]||"<?>")+(t===2?"</svg>":t===3?"</math>":"")),i]},N=class o{constructor({strings:t,_$litType$:e},i){let s;this.parts=[];let r=0,n=0,l=t.length-1,a=this.parts,[d,u]=Ht(t,e);if(this.el=o.createElement(d,i),$.currentNode=this.el.content,e===2||e===3){let c=this.el.content.firstChild;c.replaceWith(...c.childNodes)}for(;(s=$.nextNode())!==null&&a.length<l;){if(s.nodeType===1){if(s.hasAttributes())for(let c of s.getAttributeNames())if(c.endsWith(ft)){let p=u[n++],f=s.getAttribute(c).split(g),I=/([.?@])?(.*)/.exec(p);a.push({type:1,index:r,name:I[2],strings:f,ctor:I[1]==="."?K:I[1]==="?"?G:I[1]==="@"?J:x}),s.removeAttribute(c)}else c.startsWith(g)&&(a.push({type:6,index:r}),s.removeAttribute(c));if(vt.test(s.tagName)){let c=s.textContent.split(g),p=c.length-1;if(p>0){s.textContent=D?D.emptyScript:"";for(let f=0;f<p;f++)s.append(c[f],U()),$.nextNode(),a.push({type:2,index:++r});s.append(c[p],U())}}}else if(s.nodeType===8)if(s.data===gt)a.push({type:2,index:r});else{let c=-1;for(;(c=s.data.indexOf(g,c+1))!==-1;)a.push({type:7,index:r}),c+=g.length-1}r++}}static createElement(t,e){let i=b.createElement("template");return i.innerHTML=t,i}};function E(o,t,e=o,i){if(t===A)return t;let s=i!==void 0?e._$Co?.[i]:e._$Cl,r=O(t)?void 0:t._$litDirective$;return s?.constructor!==r&&(s?._$AO?.(!1),r===void 0?s=void 0:(s=new r(o),s._$AT(o,e,i)),i!==void 0?(e._$Co??=[])[i]=s:e._$Cl=s),s!==void 0&&(t=E(o,s._$AS(o,t.values),s,i)),t}var W=class{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){let{el:{content:e},parts:i}=this._$AD,s=(t?.creationScope??b).importNode(e,!0);$.currentNode=s;let r=$.nextNode(),n=0,l=0,a=i[0];for(;a!==void 0;){if(n===a.index){let d;a.type===2?d=new R(r,r.nextSibling,this,t):a.type===1?d=new a.ctor(r,a.name,a.strings,this,t):a.type===6&&(d=new Z(r,this,t)),this._$AV.push(d),a=i[++l]}n!==a?.index&&(r=$.nextNode(),n++)}return $.currentNode=b,s}p(t){let e=0;for(let i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(t,i,e),e+=i.strings.length-2):i._$AI(t[e])),e++}},R=class o{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,e,i,s){this.type=2,this._$AH=h,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=i,this.options=s,this._$Cv=s?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode,e=this._$AM;return e!==void 0&&t?.nodeType===11&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=E(this,t,e),O(t)?t===h||t==null||t===""?(this._$AH!==h&&this._$AR(),this._$AH=h):t!==this._$AH&&t!==A&&this._(t):t._$litType$!==void 0?this.$(t):t.nodeType!==void 0?this.T(t):Lt(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==h&&O(this._$AH)?this._$AA.nextSibling.data=t:this.T(b.createTextNode(t)),this._$AH=t}$(t){let{values:e,_$litType$:i}=t,s=typeof i=="number"?this._$AC(t):(i.el===void 0&&(i.el=N.createElement(yt(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===s)this._$AH.p(e);else{let r=new W(s,this),n=r.u(this.options);r.p(e),this.T(n),this._$AH=r}}_$AC(t){let e=_t.get(t.strings);return e===void 0&&_t.set(t.strings,e=new N(t)),e}k(t){X(this._$AH)||(this._$AH=[],this._$AR());let e=this._$AH,i,s=0;for(let r of t)s===e.length?e.push(i=new o(this.O(U()),this.O(U()),this,this.options)):i=e[s],i._$AI(r),s++;s<e.length&&(this._$AR(i&&i._$AB.nextSibling,s),e.length=s)}_$AR(t=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);t!==this._$AB;){let i=ct(t).nextSibling;ct(t).remove(),t=i}}setConnected(t){this._$AM===void 0&&(this._$Cv=t,this._$AP?.(t))}},x=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,i,s,r){this.type=1,this._$AH=h,this._$AN=void 0,this.element=t,this.name=e,this._$AM=s,this.options=r,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=h}_$AI(t,e=this,i,s){let r=this.strings,n=!1;if(r===void 0)t=E(this,t,e,0),n=!O(t)||t!==this._$AH&&t!==A,n&&(this._$AH=t);else{let l=t,a,d;for(t=r[0],a=0;a<r.length-1;a++)d=E(this,l[i+a],e,a),d===A&&(d=this._$AH[a]),n||=!O(d)||d!==this._$AH[a],d===h?t=h:t!==h&&(t+=(d??"")+r[a+1]),this._$AH[a]=d}n&&!s&&this.j(t)}j(t){t===h?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},K=class extends x{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===h?void 0:t}},G=class extends x{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==h)}},J=class extends x{constructor(t,e,i,s,r){super(t,e,i,s,r),this.type=5}_$AI(t,e=this){if((t=E(this,t,e,0)??h)===A)return;let i=this._$AH,s=t===h&&i!==h||t.capture!==i.capture||t.once!==i.once||t.passive!==i.passive,r=t!==h&&(i===h||s);s&&this.element.removeEventListener(this.name,this,i),r&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}},Z=class{constructor(t,e,i){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(t){E(this,t)}};var Vt=Q.litHtmlPolyfillSupport;Vt?.(N,R),(Q.litHtmlVersions??=[]).push("3.3.3");var $t=(o,t,e)=>{let i=e?.renderBefore??t,s=i._$litPart$;if(s===void 0){let r=e?.renderBefore??null;i._$litPart$=s=new R(t.insertBefore(U(),r),r,void 0,e??{})}return s._$AI(o),s};var et=globalThis,v=class extends m{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){let e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=$t(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return A}};v._$litElement$=!0,v.finalized=!0,et.litElementHydrateSupport?.({LitElement:v});var Dt=et.litElementPolyfillSupport;Dt?.({LitElement:v});(et.litElementVersions??=[]).push("4.2.2");var jt={attribute:!0,type:String,converter:T,reflect:!1,hasChanged:V},zt=(o=jt,t,e)=>{let{kind:i,metadata:s}=e,r=globalThis.litPropertyMetadata.get(s);if(r===void 0&&globalThis.litPropertyMetadata.set(s,r=new Map),i==="setter"&&((o=Object.create(o)).wrapped=!0),r.set(e.name,o),i==="accessor"){let{name:n}=e;return{set(l){let a=t.get.call(this);t.set.call(this,l),this.requestUpdate(n,a,o,!0,l)},init(l){return l!==void 0&&this.C(n,void 0,o,l),l}}}if(i==="setter"){let{name:n}=e;return function(l){let a=this[n];t.call(this,l),this.requestUpdate(n,a,o,!0,l)}}throw Error("Unsupported decorator location: "+i)};function j(o){return(t,e)=>typeof e=="object"?zt(o,t,e):((i,s,r)=>{let n=s.hasOwnProperty(r);return s.constructor.createProperty(r,i),n?Object.getOwnPropertyDescriptor(s,r):void 0})(o,t,e)}function it(o){return j({...o,state:!0,attribute:!1})}function bt(o,t){let e,i,s=((...r)=>{i=r,e!==void 0&&clearTimeout(e),e=setTimeout(()=>{e=void 0,i&&(o(...i),i=void 0)},t)});return s.cancel=()=>{e!==void 0&&clearTimeout(e),e=void 0,i=void 0},s}var st="media_player.pandora",At="button.pandora_love",Et="button.pandora_ban",xt="button.pandora_tired",St="button.pandora_restart";var Bt=100,qt=2,Ft=5e3,Yt=1,S=class extends v{constructor(){super(),this._debouncedSetVolume=bt(t=>this._callSetVolume(t),Bt)}static getStubConfig(){return{type:"custom:gomac-pandora-card",entity:st}}setConfig(t){if(!t||typeof t!="object")throw new Error("gomac-pandora-card: invalid configuration");this._config=t}getCardSize(){return 4}get _entityId(){return this._config?.entity??st}get _loveEntityId(){return this._config?.love_entity??At}get _banEntityId(){return this._config?.ban_entity??Et}get _tiredEntityId(){return this._config?.tired_entity??xt}get _restartEntityId(){return this._config?.restart_entity??St}get _watchedEntityIds(){return[this._entityId,this._loveEntityId,this._banEntityId,this._tiredEntityId,this._restartEntityId]}get _stateObj(){return this.hass?.states[this._entityId]}shouldUpdate(t){if(!this._config)return!1;if(!t.has("hass"))return!0;let e=t.get("hass");return e?this._watchedEntityIds.some(i=>e.states[i]!==this.hass.states[i]):!0}willUpdate(t){if(this._localVolumePercent===void 0||!t.has("hass"))return;let e=this._volumePercentFromState();e!==void 0&&Math.abs(e-this._localVolumePercent)<=Yt&&this._clearLocalVolume()}render(){if(!this._config||!this.hass)return h;let t=this._stateObj;if(!t)return _`
        <ha-card>
          <div class="missing-entity">Entity <code>${this._entityId}</code> not found.</div>
        </ha-card>
      `;let e=t.attributes,i=typeof e.media_title=="string"?e.media_title:"",s=typeof e.media_artist=="string"?e.media_artist:"",r=typeof e.media_album_name=="string"?e.media_album_name:"",n=typeof e.entity_picture=="string"?e.entity_picture:"",l=typeof e.source=="string"?e.source:"",a=Array.isArray(e.source_list)?e.source_list.filter(p=>typeof p=="string"):[],d=t.state==="unavailable"||t.state==="unknown",u=t.state==="playing",c=this._localVolumePercent??this._volumePercentFromState()??0;return _`
      <ha-card>
        <div class="player">
          <div class="now-playing">
            <div class="cover" style="${n?`background-image: url(${n})`:""}">
              ${n?h:_`<ha-icon icon="mdi:radio"></ha-icon>`}
            </div>
            <div class="meta">
              <div class="title">${i||"Nothing playing"}</div>
              ${s?_`<div class="artist">${s}</div>`:h}
              ${r?_`<div class="album">${r}</div>`:h}
              ${l?_`<div class="source-badge">${l}</div>`:h}
            </div>
          </div>

          <div class="transport">
            <ha-icon-button
              .disabled=${d}
              .label=${u?"Pause":"Play"}
              @click=${this._handlePlayPause}
            >
              <ha-icon icon="${u?"mdi:pause":"mdi:play"}"></ha-icon>
            </ha-icon-button>
            <ha-icon-button .disabled=${d} label="Next" @click=${this._handleNext}>
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </ha-icon-button>
          </div>

          <div class="volume-row">
            <ha-icon icon="${c===0?"mdi:volume-mute":"mdi:volume-high"}"></ha-icon>
            <input
              type="range"
              class="volume-slider"
              min="0"
              max="100"
              step="${qt}"
              .value="${String(c)}"
              ?disabled=${d}
              @input=${this._handleVolumeInput}
              @change=${this._handleVolumeChange}
              aria-label="Volume"
            />
            <span class="volume-value">${c}%</span>
          </div>

          <div class="source-row">
            <ha-icon icon="mdi:radio-tower"></ha-icon>
            <select
              class="source-select"
              ?disabled=${d||a.length===0}
              @change=${this._handleSourceChange}
              aria-label="Station"
            >
              ${a.length===0?_`<option value="" selected>${l||"No stations known yet"}</option>`:a.map(p=>_`<option value="${p}" ?selected=${p===l}>${p}</option>`)}
            </select>
          </div>

          <div class="rating-row">
            <ha-icon-button .disabled=${d} label="Love" @click=${()=>this._pressButton(this._loveEntityId)}>
              <ha-icon icon="mdi:heart"></ha-icon>
            </ha-icon-button>
            <ha-icon-button .disabled=${d} label="Ban" @click=${()=>this._pressButton(this._banEntityId)}>
              <ha-icon icon="mdi:thumb-down"></ha-icon>
            </ha-icon-button>
            <ha-icon-button .disabled=${d} label="Tired" @click=${()=>this._pressButton(this._tiredEntityId)}>
              <ha-icon icon="mdi:sleep"></ha-icon>
            </ha-icon-button>
            <ha-icon-button label="Restart pianobar" @click=${()=>this._pressButton(this._restartEntityId)}>
              <ha-icon icon="mdi:restart"></ha-icon>
            </ha-icon-button>
          </div>
        </div>
      </ha-card>
    `}_volumePercentFromState(){let t=this._stateObj?.attributes.volume_level;return typeof t=="number"?Math.round(t*100):void 0}_clearLocalVolume(){this._localVolumePercent=void 0,this._volumeConfirmTimeout!==void 0&&(clearTimeout(this._volumeConfirmTimeout),this._volumeConfirmTimeout=void 0)}_handlePlayPause(){let t=this._stateObj;if(!t||!this.hass)return;let e=t.state==="playing"?"media_pause":"media_play";this.hass.callService("media_player",e,{entity_id:this._entityId})}_handleNext(){this.hass?.callService("media_player","media_next_track",{entity_id:this._entityId})}_handleSourceChange(t){let e=t.target.value;!e||!this.hass||this.hass.callService("media_player","select_source",{entity_id:this._entityId,source:e})}_handleVolumeInput(t){let e=t.target.valueAsNumber;this._setLocalVolume(e),this._debouncedSetVolume(e)}_handleVolumeChange(t){let e=t.target.valueAsNumber;this._setLocalVolume(e),this._debouncedSetVolume.cancel(),this._callSetVolume(e)}_setLocalVolume(t){this._localVolumePercent=t,this._volumeConfirmTimeout!==void 0&&clearTimeout(this._volumeConfirmTimeout),this._volumeConfirmTimeout=setTimeout(()=>{this._volumeConfirmTimeout=void 0,this._localVolumePercent=void 0,this.requestUpdate()},Ft)}_callSetVolume(t){this.hass?.callService("media_player","volume_set",{entity_id:this._entityId,volume_level:t/100})}_pressButton(t){this.hass?.callService("button","press",{entity_id:t})}static{this.styles=q`
    ha-card {
      overflow: hidden;
    }

    .player {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }

    .missing-entity {
      padding: 16px;
      color: var(--error-color, #db4437);
    }

    .now-playing {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .cover {
      flex: 0 0 auto;
      width: 64px;
      height: 64px;
      border-radius: 8px;
      background-color: var(--secondary-background-color);
      background-size: cover;
      background-position: center;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
    }

    .cover ha-icon {
      --mdc-icon-size: 28px;
    }

    .meta {
      min-width: 0;
      flex: 1 1 auto;
    }

    .title {
      font-size: 18px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .artist,
    .album {
      font-size: 13px;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source-badge {
      margin-top: 4px;
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--primary-color);
    }

    .transport {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .transport ha-icon-button {
      --mdc-icon-button-size: 48px;
      --mdc-icon-size: 28px;
      color: var(--primary-text-color);
    }

    .volume-row,
    .source-row {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--secondary-text-color);
    }

    .volume-slider {
      flex: 1 1 auto;
      appearance: none;
      -webkit-appearance: none;
      height: 4px;
      border-radius: 2px;
      background: var(--divider-color);
      outline: none;
    }

    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--primary-color);
      cursor: pointer;
    }

    .volume-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border: none;
      border-radius: 50%;
      background: var(--primary-color);
      cursor: pointer;
    }

    .volume-slider:disabled::-webkit-slider-thumb {
      background: var(--disabled-text-color);
    }

    .volume-value {
      flex: 0 0 auto;
      width: 2.5em;
      text-align: right;
      font-size: 13px;
    }

    .source-select {
      flex: 1 1 auto;
      background: none;
      border: none;
      border-bottom: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      font-size: 14px;
      padding: 4px 0;
    }

    .rating-row {
      display: flex;
      align-items: center;
      justify-content: space-evenly;
      border-top: 1px solid var(--divider-color);
      padding-top: 8px;
    }

    .rating-row ha-icon-button {
      color: var(--secondary-text-color);
    }
  `}};M([j({attribute:!1})],S.prototype,"hass",2),M([it()],S.prototype,"_config",2),M([it()],S.prototype,"_localVolumePercent",2);customElements.define("gomac-pandora-card",S);window.customCards=window.customCards||[];window.customCards.push({type:"gomac-pandora-card",name:"GOMAC Pandora Card",description:"Unified media_player card for the pianobar/Pandora bridge, with a live-drag volume slider and love/ban/tired/restart controls."});export{S as GomacPandoraCard};
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
@lit/reactive-element/decorators/custom-element.js:
@lit/reactive-element/decorators/property.js:
@lit/reactive-element/decorators/state.js:
@lit/reactive-element/decorators/event-options.js:
@lit/reactive-element/decorators/base.js:
@lit/reactive-element/decorators/query.js:
@lit/reactive-element/decorators/query-all.js:
@lit/reactive-element/decorators/query-async.js:
@lit/reactive-element/decorators/query-assigned-nodes.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-elements.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
