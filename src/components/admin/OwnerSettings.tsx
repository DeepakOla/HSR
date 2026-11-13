import { readApiJson } from '../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import '../../styles/admin.css';

type Locale = 'en' | 'hi';
type Profile = {
  business_name_en:string; business_name_hi:string; city:string; address_line:string; map_url:string;
  contact_phone:string; whatsapp_number:string; contact_email:string; vpa_id:string; vpa_payee_name:string;
  hold_minutes:number; seo_title_en:string; seo_title_hi:string; seo_desc_en:string; seo_desc_hi:string;
};
type Category = {
  code:string; sortOrder:number; nameEn:string; nameHi:string; cylinderCount:number;
  basePricePaise:number; gstRateBps:number; advancePaise:number|null; isActive:boolean;
};
type Schedule = {
  workingDays:number[];openTime:string;closeTime:string;breakStart:string|null;breakEnd:string|null;
  slotIntervalMinutes:15|20;extendedHoursEnabled:boolean;extendedHoursPublic:boolean;extendedMinutes:number;
  standardSlotCount:number;extendedSlotCount:number;
};
type ContentRecord = {
  id?: number;
  locale: 'en' | 'hi';
  page_key: string;
  title: string;
  body: string;
  updated_at?: string;
};

const labels = {
  en: {
    title:'Owner settings', intro:'Manage the public business identity, customer prices, operating schedule and page content.',
    profile:'Business profile',vehicles:'Cylinder-count prices',schedule:'Operating hours and appointment intervals',
    nameEn:'Business name (English)',nameHi:'Business name (Hindi)',city:'City / district',address:'Full address',
    map:'Google Maps directions URL',phone:'Call number',whatsapp:'WhatsApp number',email:'Contact email',
    vpa:'Merchant UPI ID',payee:'UPI payee name',hold:'Unpaid hold duration (minutes)',
    seoEn:'English SEO title',seoHi:'Hindi SEO title',descEn:'English meta description',descHi:'Hindi meta description',
    saveProfile:'Save profile',saveCategories:'Save cylinder pricing',
    categoryCode:'Internal code',displayEn:'Display name (English)',displayHi:'Display name (Hindi)',
    cylinders:'CNG cylinder count',base:'Total base price for this count (₹)',gst:'GST (fixed at 18%)',advance:'Advance amount (₹)',active:'Available for bookings',
    open:'Opening time',close:'Closing time',interval:'Appointment interval (minutes)',extended:'Enable one additional operating hour',extendedPublic:'Show extra-hour units to customers online',
    breakStart:'Break starts (optional)',breakEnd:'Break ends (optional)',workingDays:'Working days',
    slots:'Slot windows',slotCapacity:'Cylinders',saveSchedule:'Save schedule',
    note:'Each cylinder reserves one continuous appointment unit. At a 20-minute interval, a six-cylinder vehicle needs two consecutive hours. The extra hour adds three 20-minute units or four 15-minute units. Existing bookings keep their original times and prices.',
    profileSaved:'Business profile saved.',categoriesSaved:'Cylinder pricing saved.',scheduleSaved:'Schedule saved.',contentSaved:'Page content saved successfully.',
    effective:'New schedule applies from',loading:'Loading owner settings…',error:'Could not load owner settings.',
    saveError:'Could not save changes.',lang:'हिंदी',r2:'Payment screenshot upload is disabled until a private R2 bucket is configured and tested.',
    capacityTotal:'Capacity total',invalidCapacity:'Slot capacities must add up to the daily capacity.',
    noSlots:'No slots were generated. Check the opening/closing times and duration.',
    setup:'SETUP_REQUIRED',
    days:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    contentSection:'Website content (CMS)',
    contentIntro:'Edit public informational pages in English and Hindi. Content supports structured sections and bullet points.',
    selectPage:'Select page',
    contentLang:'Content language',
    pageTitle:'Page title',
    pageBody:'Page content (Structured JSON or clean plain text)',
    saveContent:'Save page content',
    insertTemplate:'Insert structured JSON template',
    preview:'Live preview',
    pages:{
      about:'About',
      services:'Services',
      'how-it-works':'How It Works',
      contact:'Contact',
    },
  },
  hi: {
    title:'मालिक की सेटिंग्स',intro:'व्यवसाय की जानकारी, ग्राहक कीमतें, कार्य समय और वेबसाइट सामग्री बदलें।',
    profile:'व्यवसाय प्रोफ़ाइल',vehicles:'सिलेंडर संख्या के अनुसार कीमत',schedule:'कार्य समय और अपॉइंटमेंट अंतराल',
    nameEn:'व्यवसाय का नाम (अंग्रेज़ी)',nameHi:'व्यवसाय का नाम (हिंदी)',city:'शहर / ज़िला',address:'पूरा पता',
    map:'Google Maps दिशा URL',phone:'कॉल नंबर',whatsapp:'WhatsApp नंबर',email:'संपर्क ईमेल',
    vpa:'मर्चेंट UPI ID',payee:'UPI प्राप्तकर्ता नाम',hold:'बिना भुगतान होल्ड अवधि (मिनट)',
    seoEn:'अंग्रेज़ी SEO शीर्षक',seoHi:'हिंदी SEO शीर्षक',descEn:'अंग्रेज़ी विवरण',descHi:'हिंदी विवरण',
    saveProfile:'प्रोफ़ाइल सेव करें',saveCategories:'सिलेंडर की कीमतें सेव करें',
    categoryCode:'आंतरिक कोड',displayEn:'दिखने वाला नाम (अंग्रेज़ी)',displayHi:'दिखने वाला नाम (हिंदी)',
    cylinders:'CNG सिलेंडर की संख्या',base:'इस संख्या के लिए कुल मूल कीमत (₹)',gst:'GST (18% निश्चित)',advance:'अग्रिम राशि (₹)',active:'बुकिंग के लिए उपलब्ध',
    open:'खुलने का समय',close:'बंद होने का समय',interval:'अपॉइंटमेंट अंतराल (मिनट)',extended:'एक अतिरिक्त कार्य घंटा सक्षम करें',extendedPublic:'अतिरिक्त समय ऑनलाइन ग्राहकों को दिखाएँ',
    breakStart:'ब्रेक शुरू (वैकल्पिक)',breakEnd:'ब्रेक समाप्त (वैकल्पिक)',workingDays:'कार्य दिवस',
    slots:'समय स्लॉट',slotCapacity:'सिलेंडर',saveSchedule:'समय सेव करें',
    note:'हर CNG सिलेंडर के लिए लगातार एक समय इकाई आरक्षित होती है। 20 मिनट के अंतराल पर छह सिलेंडर के लिए लगातार दो घंटे चाहिए। अतिरिक्त घंटे में 20-मिनट अंतराल पर तीन या 15-मिनट अंतराल पर चार इकाइयाँ जुड़ती हैं। पुरानी बुकिंग का समय और कीमत नहीं बदलेंगे।',
    profileSaved:'व्यवसाय प्रोफ़ाइल सेव हो गई।',categoriesSaved:'सिलेंडर की कीमतें सेव हो गईं।',scheduleSaved:'कार्य समय सेव हो गया।',contentSaved:'पृष्ठ सामग्री सफलतापूर्वक सेव हो गई।',
    effective:'नया समय लागू होगा',loading:'मालिक सेटिंग्स लोड हो रही हैं…',error:'मालिक सेटिंग्स लोड नहीं हो सकीं।',
    saveError:'बदलाव सेव नहीं हो सके।',lang:'English',r2:'निजी R2 बकेट कॉन्फ़िगर और जांचे जाने तक भुगतान स्क्रीनशॉट अपलोड बंद रहेगा।',
    capacityTotal:'कुल क्षमता',invalidCapacity:'सभी स्लॉट की क्षमता का योग दैनिक क्षमता के बराबर होना चाहिए।',
    noSlots:'कोई स्लॉट नहीं बना। खुलने/बंद होने का समय और अवधि जांचें।',
    setup:'SETUP_REQUIRED',
    days:['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'],
    contentSection:'वेबसाइट सामग्री (CMS)',
    contentIntro:'अंग्रेज़ी और हिंदी में सार्वजनिक सूचना पृष्ठ संपादित करें। सामग्री संरचित अनुभागों और बुलेट बिंदुओं का समर्थन करती है।',
    selectPage:'पृष्ठ चुनें',
    contentLang:'सामग्री भाषा',
    pageTitle:'पृष्ठ शीर्षक',
    pageBody:'पृष्ठ सामग्री (संरचित JSON या सादा पाठ)',
    saveContent:'पृष्ठ सामग्री सेव करें',
    insertTemplate:'संरचित JSON खाका डालें',
    preview:'लाइव पूर्वावलोकन',
    pages:{
      about:'परिचय (About)',
      services:'सेवाएँ (Services)',
      'how-it-works':'प्रक्रिया (How It Works)',
      contact:'संपर्क (Contact)',
    },
  }
};

function asMinutesSafe(value:string){const [hours,minutes]=value.split(':').map(Number);return hours*60+minutes;}
function inr(value:number|null){return value==null?'':String(value/100);}
function paise(value:string){if(!value.trim())return null;const amount=Number(value);return Number.isFinite(amount)&&amount>=0?Math.round(amount*100):null;}

export default function OwnerSettings(){
  const [locale,setLocale]=useState<Locale>('en');
  const t=labels[locale];
  const [profile,setProfile]=useState<Profile|null>(null);
  const [categories,setCategories]=useState<Category[]>([]);
  const [schedule,setSchedule]=useState<Schedule|null>(null);
  const [contentItems,setContentItems]=useState<ContentRecord[]>([]);
  const [selectedPage,setSelectedPage]=useState<string>('about');
  const [contentLang,setContentLang]=useState<Locale>('en');

  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [effectiveFrom,setEffectiveFrom]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [pr,cr,sr,ctr]=await Promise.all([
        fetch('/api/admin/settings/'),
        fetch('/api/admin/categories/'),
        fetch('/api/admin/schedule/'),
        fetch('/api/admin/content/'),
      ]);
      const [p,c,s,ct]=await Promise.all([readApiJson(pr),readApiJson(cr),readApiJson(sr),readApiJson(ctr)]) as any[];
      if(!pr.ok||!cr.ok||!sr.ok||!ctr.ok)throw new Error(p.error?.message??c.error?.message??s.error?.message??ct.error?.message??t.error);
      setProfile(p.data.settings);
      setCategories((c.data.categories??[]).map((x:any)=>({...x,isActive:x.isActive===1||x.isActive===true})));
      setSchedule({...s.data,breakStart:s.data.breakStart??'',breakEnd:s.data.breakEnd??'',slotIntervalMinutes:s.data.slotIntervalMinutes===15?15:20,extendedHoursEnabled:!!s.data.extendedHoursEnabled,extendedHoursPublic:!!s.data.extendedHoursPublic,extendedMinutes:60});
      setContentItems(ct.data?.content??[]);
    }catch(e){setError(e instanceof Error?e.message:t.error);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();},[load]);
  const setField=(key:keyof Profile,value:string)=>setProfile((p)=>p?({...p,[key]:value}):p);

  const saveProfile=async()=>{
    if(!profile)return;
    setBusy(true);setError('');setMessage('');
    try{
      const r=await fetch('/api/admin/settings/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...profile,hold_minutes:Number(profile.hold_minutes)})});
      const data:any=await readApiJson(r);if(!r.ok)throw new Error(data.error?.message??t.saveError);
      setMessage(t.profileSaved);
    }catch(e){setError(e instanceof Error?e.message:t.saveError);}
    finally{setBusy(false);}
  };

  const saveCategories=async()=>{
    if(!categories.length)return;
    setBusy(true);setError('');setMessage('');
    try{
      const r=await fetch('/api/admin/categories/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({categories})});
      const data:any=await readApiJson(r);if(!r.ok)throw new Error(data.error?.message??t.saveError);
      setMessage(t.categoriesSaved);await load();
    }catch(e){setError(e instanceof Error?e.message:t.saveError);}
    finally{setBusy(false);}
  };

  const editCategory=(index:number,patch:Partial<Category>)=>setCategories((items)=>items.map((item,i)=>i===index?{...item,...patch}:item));

  const changeSchedule=(patch:Partial<Schedule>)=>setSchedule((current)=>current?({...current,...patch}):current);

  const saveSchedule=async()=>{
    if(!schedule)return;
    setBusy(true);setError('');setMessage('');
    try{
      const payload={workingDays:schedule.workingDays,openTime:schedule.openTime,closeTime:schedule.closeTime,
        breakStart:schedule.breakStart||null,breakEnd:schedule.breakEnd||null,
        slotIntervalMinutes:Number(schedule.slotIntervalMinutes),extendedHoursEnabled:schedule.extendedHoursEnabled,
        extendedHoursPublic:schedule.extendedHoursEnabled&&schedule.extendedHoursPublic};
      const r=await fetch('/api/admin/schedule/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const data:any=await readApiJson(r);if(!r.ok)throw new Error(data.error?.message??t.saveError);
      setEffectiveFrom(data.data.effectiveFrom??'');setMessage(t.scheduleSaved);await load();
    }catch(e){setError(e instanceof Error?e.message:t.saveError);}
    finally{setBusy(false);}
  };

  const currentContentItem: ContentRecord = contentItems.find(
    (c) => c.page_key === selectedPage && c.locale === contentLang
  ) ?? {
    page_key: selectedPage,
    locale: contentLang,
    title: labels[contentLang].pages[selectedPage as keyof typeof labels['en']['pages']] ?? selectedPage,
    body: 'SETUP_REQUIRED',
  };

  const updateCurrentContent = (patch: Partial<ContentRecord>) => {
    setContentItems((prev) => {
      const idx = prev.findIndex((c) => c.page_key === selectedPage && c.locale === contentLang);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      }
      return [...prev, { ...currentContentItem, ...patch }];
    });
  };

  const saveContent = async () => {
    if (!currentContentItem) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await fetch('/api/admin/content/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageKey: selectedPage,
          locale: contentLang,
          title: currentContentItem.title,
          body: currentContentItem.body,
        }),
      });
      const data: any = await readApiJson(r);
      if (!r.ok) throw new Error(data.error?.message ?? t.saveError);
      setMessage(t.contentSaved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  const insertTemplate = () => {
    const template = {
      summary: contentLang === 'en'
        ? 'Professional CNG cylinder hydro-testing and PESO compliance verification.'
        : 'पेशेवर सीएनजी सिलेंडर हाइड्रो-परीक्षण और पीईएसओ अनुपालन सत्यापन।',
      sections: [
        {
          heading: contentLang === 'en' ? 'Quality & Safety Standards' : 'गुणवत्ता और सुरक्षा मानक',
          subheading: contentLang === 'en' ? 'Rigorous 5-Step Process' : 'कठोर 5-चरणीय प्रक्रिया',
          paragraphs: [
            contentLang === 'en'
              ? 'Our hydro-testing station operates calibrated electronic hydrostatic equipment tested to 300 bar pressure.'
              : 'हमारा हाइड्रो-परीक्षण स्टेशन 300 बार दबाव तक कैलिब्रेटेड इलेक्ट्रॉनिक हाइड्रोस्टेटिक उपकरणों का उपयोग करता है।',
          ],
          bullets: [
            contentLang === 'en' ? 'Hydrostatic stretch testing to regulatory pressure' : 'नियामक दबाव तक हाइड्रोस्टेटिक खिंचाव परीक्षण',
            contentLang === 'en' ? 'Internal ultrasonic flaw inspection' : 'आंतरिक अल्ट्रासोनिक दोष निरीक्षण',
            contentLang === 'en' ? 'Digital tare & water-capacity weight check' : 'डिजिटल टेयर और जल-क्षमता भार जांच',
            contentLang === 'en' ? 'Official compliance certificate generation' : 'आधिकारिक अनुपालन प्रमाणपत्र जारी करना',
          ],
        },
      ],
    };
    updateCurrentContent({ body: JSON.stringify(template, null, 2) });
  };

  // Safe preview parser
  const renderPreview = () => {
    const raw = currentContentItem.body.trim();
    if (raw === 'SETUP_REQUIRED' || !raw) {
      return <p style={{ fontStyle: 'italic', color: '#6b7280' }}>Page is in SETUP_REQUIRED state.</p>;
    }
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const parsed = JSON.parse(raw);
        return (
          <div>
            {parsed.summary && <p style={{ fontWeight: 600, color: '#374151', marginBottom: '1rem' }}>{parsed.summary}</p>}
            {Array.isArray(parsed.sections) && parsed.sections.map((sec: any, idx: number) => (
              <div key={idx} style={{ marginTop: '1rem' }}>
                {sec.heading && <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.5rem 0' }}>{sec.heading}</h3>}
                {sec.subheading && <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#4b5563', margin: '0.25rem 0' }}>{sec.subheading}</h4>}
                {Array.isArray(sec.paragraphs) && sec.paragraphs.map((p: string, pIdx: number) => (
                  <p key={pIdx} style={{ margin: '0.5rem 0', lineHeight: 1.5 }}>{p}</p>
                ))}
                {Array.isArray(sec.bullets) && (
                  <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0' }}>
                    {sec.bullets.map((b: string, bIdx: number) => (
                      <li key={bIdx} style={{ margin: '0.25rem 0' }}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );
      } catch {
        // Fall back to plain text
      }
    }
    return (
      <div>
        {raw.split(/\n\s*\n/).map((para, idx) => (
          <p key={idx} style={{ margin: '0.5rem 0', lineHeight: 1.5 }}>{para}</p>
        ))}
      </div>
    );
  };

  if(loading&&!profile)return <div className="admin-loading">{t.loading}</div>;

  return <div className="admin-app" lang={locale}>
    <div className="admin-heading">
      <div><p className="admin-eyebrow">OWNER / CONFIGURATION</p><h1>{t.title}</h1><p className="admin-subtitle">{t.intro}</p></div>
      <button className="admin-lang" onClick={()=>setLocale(locale==='en'?'hi':'en')}>{t.lang}</button>
    </div>
    {error&&<div className="admin-alert error" role="alert">{error}</div>}
    {message&&<div className="admin-alert" role="status">{message} {effectiveFrom&&<strong>{t.effective}: {effectiveFrom}</strong>}</div>}

    {profile&&<section className="admin-card owner-section">
      <div className="owner-section-head"><div><p className="admin-eyebrow">01 / PROFILE</p><h2 className="admin-section-title">{t.profile}</h2></div><button className="admin-button" disabled={busy} onClick={saveProfile}>{t.saveProfile}</button></div>
      <div className="owner-grid">
        <label className="admin-field">{t.nameEn}<input className="admin-input" value={profile.business_name_en} onChange={e=>setField('business_name_en',e.target.value)}/></label>
        <label className="admin-field">{t.nameHi}<input className="admin-input" value={profile.business_name_hi} onChange={e=>setField('business_name_hi',e.target.value)}/></label>
        <label className="admin-field">{t.city}<input className="admin-input" value={profile.city} onChange={e=>setField('city',e.target.value)}/></label>
        <label className="admin-field">{t.address}<input className="admin-input" value={profile.address_line} onChange={e=>setField('address_line',e.target.value)}/></label>
        <label className="admin-field">{t.map}<input className="admin-input" value={profile.map_url} onChange={e=>setField('map_url',e.target.value)}/></label>
        <label className="admin-field">{t.phone}<input className="admin-input" value={profile.contact_phone} onChange={e=>setField('contact_phone',e.target.value)}/></label>
        <label className="admin-field">{t.whatsapp}<input className="admin-input" value={profile.whatsapp_number} onChange={e=>setField('whatsapp_number',e.target.value)}/></label>
        <label className="admin-field">{t.email}<input className="admin-input" value={profile.contact_email} onChange={e=>setField('contact_email',e.target.value)}/></label>
        <label className="admin-field">{t.vpa}<input className="admin-input" value={profile.vpa_id} onChange={e=>setField('vpa_id',e.target.value)}/></label>
        <label className="admin-field">{t.payee}<input className="admin-input" value={profile.vpa_payee_name} onChange={e=>setField('vpa_payee_name',e.target.value)}/></label>
        <label className="admin-field">{t.hold}<input className="admin-input" type="number" min="5" max="120" value={profile.hold_minutes} onChange={e=>setProfile(p=>p?({...p,hold_minutes:Number(e.target.value)}):p)}/></label>
      </div>
      <details className="owner-seo"><summary>SEO metadata / खोज मेटाडेटा</summary><div className="owner-grid">
        <label className="admin-field">{t.seoEn}<input className="admin-input" value={profile.seo_title_en} onChange={e=>setField('seo_title_en',e.target.value)}/></label>
        <label className="admin-field">{t.seoHi}<input className="admin-input" value={profile.seo_title_hi} onChange={e=>setField('seo_title_hi',e.target.value)}/></label>
        <label className="admin-field">{t.descEn}<textarea className="admin-textarea" value={profile.seo_desc_en} onChange={e=>setField('seo_desc_en',e.target.value)}/></label>
        <label className="admin-field">{t.descHi}<textarea className="admin-textarea" value={profile.seo_desc_hi} onChange={e=>setField('seo_desc_hi',e.target.value)}/></label>
      </div></details>
      <p className="admin-note">{t.r2}</p>
    </section>}

    <section className="admin-card owner-section">
      <div className="owner-section-head"><div><p className="admin-eyebrow">02 / COMMERCIALS</p><h2 className="admin-section-title">{t.vehicles}</h2></div><button className="admin-button" disabled={busy} onClick={saveCategories}>{t.saveCategories}</button></div>
      <div className="owner-category-list">{categories.map((item,index)=><div className="owner-category" key={item.code}>
        <div className="owner-category-head"><strong>{item.nameEn||item.code}</strong><label className="admin-check"><input type="checkbox" checked={item.isActive} onChange={e=>editCategory(index,{isActive:e.target.checked})}/>{t.active}</label></div>
        <div className="owner-grid">
          <label className="admin-field">{t.categoryCode}<input className="admin-input" value={item.code} readOnly/></label>
          <label className="admin-field">{t.displayEn}<input className="admin-input" value={item.nameEn} onChange={e=>editCategory(index,{nameEn:e.target.value})}/></label>
          <label className="admin-field">{t.displayHi}<input className="admin-input" value={item.nameHi} onChange={e=>editCategory(index,{nameHi:e.target.value})}/></label>
          <label className="admin-field">{t.cylinders}<input className="admin-input" type="number" min="1" max="12" value={item.cylinderCount} readOnly/></label>
          <label className="admin-field">{t.base}<input className="admin-input" type="number" min="0" step="0.01" value={inr(item.basePricePaise)} onChange={e=>editCategory(index,{basePricePaise:paise(e.target.value)??0})}/></label>
          <label className="admin-field">{t.gst}<input className="admin-input" value="18%" readOnly /></label>
          <label className="admin-field">{t.advance}<input className="admin-input" type="number" min="0" step="0.01" value={inr(item.advancePaise)} onChange={e=>editCategory(index,{advancePaise:paise(e.target.value)})}/></label>
        </div>
      </div>)}</div>
      <p className="admin-note">Initial base price: ₹2,500 × cylinder count. Each of the 12 cylinder-count prices can be edited independently. GST is fixed at 18%. Confirm the applicable SAC and tax treatment before using this setting for live billing. Configure an advance for online UPI booking; a blank advance keeps that count unavailable online.</p>
    </section>

    {schedule&&<section className="admin-card owner-section">
      <div className="owner-section-head"><div><p className="admin-eyebrow">03 / OPERATIONS</p><h2 className="admin-section-title">{t.schedule}</h2></div><button className="admin-button" disabled={busy} onClick={saveSchedule}>{t.saveSchedule}</button></div>
      <div className="owner-grid owner-schedule-grid">
        <label className="admin-field">{t.open}<input className="admin-input" type="time" value={schedule.openTime} onChange={e=>changeSchedule({openTime:e.target.value})}/></label>
        <label className="admin-field">{t.close}<input className="admin-input" type="time" value={schedule.closeTime} onChange={e=>changeSchedule({closeTime:e.target.value})}/></label>
        <label className="admin-field">{t.interval}<select className="admin-select" value={schedule.slotIntervalMinutes} onChange={e=>changeSchedule({slotIntervalMinutes:Number(e.target.value) as 15|20})}><option value={20}>20 minutes</option><option value={15}>15 minutes</option></select></label>
        <label className="admin-field">{t.breakStart}<input className="admin-input" type="time" value={schedule.breakStart??""} onChange={e=>changeSchedule({breakStart:e.target.value||null})}/></label>
        <label className="admin-field">{t.breakEnd}<input className="admin-input" type="time" value={schedule.breakEnd??""} onChange={e=>changeSchedule({breakEnd:e.target.value||null})}/></label>
      </div>
      <div className="owner-days"><strong>{t.workingDays}</strong><div className="owner-day-list">{t.days.map((day,index)=><label key={day} className="admin-check"><input type="checkbox" checked={schedule.workingDays.includes(index)} onChange={e=>setSchedule(s=>s?({...s,workingDays:e.target.checked?[...s.workingDays,index]:s.workingDays.filter(x=>x!==index)}):s)}/>{day}</label>)}</div></div>
      <div style={{display:"grid",gap:".65rem",marginTop:"1rem"}}>
        <label className="admin-check"><input type="checkbox" checked={schedule.extendedHoursEnabled} onChange={e=>changeSchedule({extendedHoursEnabled:e.target.checked,extendedHoursPublic:e.target.checked?schedule.extendedHoursPublic:false})}/>{t.extended}</label>
        <label className="admin-check"><input type="checkbox" checked={schedule.extendedHoursPublic} disabled={!schedule.extendedHoursEnabled} onChange={e=>changeSchedule({extendedHoursPublic:e.target.checked})}/>{t.extendedPublic}</label>
      </div>
      <div className="admin-card" style={{marginTop:"1rem",padding:"1rem"}}>
        <strong>Appointment capacity preview</strong>
        <p>{schedule.openTime} to {schedule.closeTime} · {schedule.slotIntervalMinutes}-minute units</p>
        <p>Standard operating hours: {Math.floor((asMinutesSafe(schedule.closeTime)-asMinutesSafe(schedule.openTime))/schedule.slotIntervalMinutes)} units before break adjustments.</p>
        <p>Extra hour: {schedule.extendedHoursEnabled?60/schedule.slotIntervalMinutes+" additional units":"disabled"} · {schedule.extendedHoursEnabled?(schedule.extendedHoursPublic?"visible to online customers":"staff-only"):"not available"}</p>
        <p className="admin-note">A booking for N cylinders occupies N consecutive available units. Six cylinders occupy 120 minutes at a 20-minute interval, or 90 minutes at a 15-minute interval. Hidden extra-hour units can be booked by reception staff.</p>
      </div>
      <p className="admin-note">{t.note}</p>
    </section>}

    <section className="admin-card owner-section">
      <div className="owner-section-head">
        <div>
          <p className="admin-eyebrow">04 / CONTENT (CMS)</p>
          <h2 className="admin-section-title">{t.contentSection}</h2>
          <p className="admin-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>{t.contentIntro}</p>
        </div>
        <button className="admin-button" disabled={busy} onClick={saveContent}>{t.saveContent}</button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', margin: '0.5rem 0' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px', color: '#4b5563' }}>{t.selectPage}</span>
          <div className="owner-tabs">
            {['about', 'services', 'how-it-works', 'contact'].map((pKey) => (
              <button
                key={pKey}
                type="button"
                className={`owner-tab ${selectedPage === pKey ? 'active' : ''}`}
                onClick={() => setSelectedPage(pKey)}
              >
                {t.pages[pKey as keyof typeof t.pages] ?? pKey}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px', color: '#4b5563' }}>{t.contentLang}</span>
          <div className="owner-tabs">
            <button
              type="button"
              className={`owner-tab ${contentLang === 'en' ? 'active' : ''}`}
              onClick={() => setContentLang('en')}
            >
              English
            </button>
            <button
              type="button"
              className={`owner-tab ${contentLang === 'hi' ? 'active' : ''}`}
              onClick={() => setContentLang('hi')}
            >
              हिंदी (Hindi)
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        <label className="admin-field">
          {t.pageTitle}
          <input
            className="admin-input"
            value={currentContentItem.title}
            onChange={(e) => updateCurrentContent({ title: e.target.value })}
          />
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.pageBody}</span>
            <button
              type="button"
              onClick={insertTemplate}
              style={{
                background: 'none',
                border: '1px solid #1e40af',
                color: '#1e40af',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {t.insertTemplate}
            </button>
          </div>
          <textarea
            className="admin-textarea"
            style={{ minHeight: '160px', fontFamily: 'monospace', fontSize: '13px' }}
            value={currentContentItem.body}
            onChange={(e) => updateCurrentContent({ body: e.target.value })}
          />
        </div>
      </div>

      <div className="owner-preview-box">
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '6px' }}>
          {t.preview} ({selectedPage} · {contentLang.toUpperCase()})
        </div>
        <h3 className="owner-preview-title">{currentContentItem.title || 'Untitled Page'}</h3>
        <div className="owner-preview-body">{renderPreview()}</div>
      </div>
    </section>
  </div>;
}
