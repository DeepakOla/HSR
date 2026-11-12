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
type Slot = {labelEn:string;labelHi:string;startTime:string;endTime:string;capacity:number};
type Schedule = {
  workingDays:number[];openTime:string;closeTime:string;breakStart:string|null;breakEnd:string|null;
  dailyCapacity:number;slotDurationMinutes:number;slots:Slot[];
};

const labels = {
  en: {
    title:'Owner settings', intro:'Manage the public business identity, customer prices and future operating schedule.',
    profile:'Business profile',vehicles:'Vehicle categories and prices',schedule:'Operating hours and slot capacity',
    nameEn:'Business name (English)',nameHi:'Business name (Hindi)',city:'City / district',address:'Full address',
    map:'Google Maps directions URL',phone:'Call number',whatsapp:'WhatsApp number',email:'Contact email',
    vpa:'Merchant UPI ID',payee:'UPI payee name',hold:'Unpaid hold duration (minutes)',
    seoEn:'English SEO title',seoHi:'Hindi SEO title',descEn:'English meta description',descHi:'Hindi meta description',
    saveProfile:'Save profile',saveCategories:'Save vehicle settings',addCategory:'Add category',
    categoryCode:'Internal code',displayEn:'Display name (English)',displayHi:'Display name (Hindi)',
    cylinders:'Cylinder count',base:'Base price (₹)',gst:'GST (%)',advance:'Advance amount (₹)',active:'Available for booking',
    open:'Opening time',close:'Closing time',duration:'Slot duration (minutes)',daily:'Daily cylinder capacity',
    breakStart:'Break starts (optional)',breakEnd:'Break ends (optional)',workingDays:'Working days',
    slots:'Slot windows',slotCapacity:'Cylinders',saveSchedule:'Save schedule',
    note:'Schedule changes apply to future dates after existing reservations. Existing bookings retain their original slot and price.',
    profileSaved:'Business profile saved.',categoriesSaved:'Vehicle settings saved.',scheduleSaved:'Schedule saved.',
    effective:'New schedule applies from',loading:'Loading owner settings…',error:'Could not load owner settings.',
    saveError:'Could not save changes.',lang:'हिंदी',r2:'Payment screenshot upload is disabled until a private R2 bucket is configured and tested.',
    capacityTotal:'Capacity total',invalidCapacity:'Slot capacities must add up to the daily capacity.',
    noSlots:'No slots were generated. Check the opening/closing times and duration.',
    setup:'SETUP_REQUIRED',
    days:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    addHint:'Use a unique code such as VAN_3_CYL.'
  },
  hi: {
    title:'मालिक की सेटिंग्स',intro:'व्यवसाय की जानकारी, ग्राहक कीमतें और भविष्य का कार्य समय बदलें।',
    profile:'व्यवसाय प्रोफ़ाइल',vehicles:'वाहन श्रेणियां और कीमतें',schedule:'कार्य समय और स्लॉट क्षमता',
    nameEn:'व्यवसाय का नाम (अंग्रेज़ी)',nameHi:'व्यवसाय का नाम (हिंदी)',city:'शहर / ज़िला',address:'पूरा पता',
    map:'Google Maps दिशा URL',phone:'कॉल नंबर',whatsapp:'WhatsApp नंबर',email:'संपर्क ईमेल',
    vpa:'मर्चेंट UPI ID',payee:'UPI प्राप्तकर्ता नाम',hold:'बिना भुगतान होल्ड अवधि (मिनट)',
    seoEn:'अंग्रेज़ी SEO शीर्षक',seoHi:'हिंदी SEO शीर्षक',descEn:'अंग्रेज़ी विवरण',descHi:'हिंदी विवरण',
    saveProfile:'प्रोफ़ाइल सेव करें',saveCategories:'वाहन सेटिंग्स सेव करें',addCategory:'श्रेणी जोड़ें',
    categoryCode:'आंतरिक कोड',displayEn:'दिखने वाला नाम (अंग्रेज़ी)',displayHi:'दिखने वाला नाम (हिंदी)',
    cylinders:'सिलेंडर संख्या',base:'मूल कीमत (₹)',gst:'GST (%)',advance:'अग्रिम राशि (₹)',active:'बुकिंग में उपलब्ध',
    open:'खुलने का समय',close:'बंद होने का समय',duration:'स्लॉट अवधि (मिनट)',daily:'दैनिक सिलेंडर क्षमता',
    breakStart:'ब्रेक शुरू (वैकल्पिक)',breakEnd:'ब्रेक समाप्त (वैकल्पिक)',workingDays:'कार्य दिवस',
    slots:'समय स्लॉट',slotCapacity:'सिलेंडर',saveSchedule:'समय सेव करें',
    note:'समय में बदलाव मौजूदा आरक्षणों के बाद भविष्य की तारीखों पर लागू होंगे। पुरानी बुकिंग का समय और कीमत नहीं बदलेंगे।',
    profileSaved:'व्यवसाय प्रोफ़ाइल सेव हो गई।',categoriesSaved:'वाहन सेटिंग्स सेव हो गईं।',scheduleSaved:'कार्य समय सेव हो गया।',
    effective:'नया समय लागू होगा',loading:'मालिक सेटिंग्स लोड हो रही हैं…',error:'मालिक सेटिंग्स लोड नहीं हो सकीं।',
    saveError:'बदलाव सेव नहीं हो सके।',lang:'English',r2:'निजी R2 बकेट कॉन्फ़िगर और जांचे जाने तक भुगतान स्क्रीनशॉट अपलोड बंद रहेगा।',
    capacityTotal:'कुल क्षमता',invalidCapacity:'सभी स्लॉट की क्षमता का योग दैनिक क्षमता के बराबर होना चाहिए।',
    noSlots:'कोई स्लॉट नहीं बना। खुलने/बंद होने का समय और अवधि जांचें।',
    setup:'SETUP_REQUIRED',
    days:['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'],
    addHint:'जैसे VAN_3_CYL जैसा अलग कोड इस्तेमाल करें।'
  }
};

function asMinutes(value:string){const [h,m]=value.split(':').map(Number);return h*60+m;}
function asTime(value:number){return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
function inr(paise:number|null){return paise==null?'':String(paise/100);}
function paise(value:string){if(!value.trim())return null;const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*100):null;}

function createSlots(schedule:Schedule):Slot[]{
  const start=asMinutes(schedule.openTime),end=asMinutes(schedule.closeTime),duration=Number(schedule.slotDurationMinutes);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||duration<30||duration>240)return [];
  const bs=schedule.breakStart?asMinutes(schedule.breakStart):-1;
  const be=schedule.breakEnd?asMinutes(schedule.breakEnd):-1;
  const windows:{startTime:string;endTime:string}[]=[];
  let cursor=start;
  while(cursor<end&&windows.length<24){
    if(bs>=0&&be>bs&&cursor>=bs&&cursor<be)cursor=be;
    if(cursor>=end)break;
    let next=Math.min(cursor+duration,end);
    if(bs>=0&&be>bs&&cursor<bs&&next>bs)next=bs;
    if(next<=cursor)break;
    windows.push({startTime:asTime(cursor),endTime:asTime(next)});
    cursor=next;
  }
  const count=windows.length;
  if(!count)return [];
  const base=Math.floor(Number(schedule.dailyCapacity)/count);
  let remainder=Number(schedule.dailyCapacity)-base*count;
  return windows.map((w)=>{const capacity=base+(remainder>0?1:0);if(remainder>0)remainder--;const label=`${w.startTime} - ${w.endTime}`;return {...w,labelEn:label,labelHi:label,capacity};});
}

export default function OwnerSettings(){
  const [locale,setLocale]=useState<Locale>('en');
  const t=labels[locale];
  const [profile,setProfile]=useState<Profile|null>(null);
  const [categories,setCategories]=useState<Category[]>([]);
  const [schedule,setSchedule]=useState<Schedule|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [effectiveFrom,setEffectiveFrom]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [pr,cr,sr]=await Promise.all([fetch('/api/admin/settings'),fetch('/api/admin/categories'),fetch('/api/admin/schedule')]);
      const [p,c,s]=await Promise.all([pr.json(),cr.json(),sr.json()]) as any[];
      if(!pr.ok||!cr.ok||!sr.ok)throw new Error(p.error?.message??c.error?.message??s.error?.message??t.error);
      setProfile(p.data.settings);
      setCategories((c.data.categories??[]).map((x:any)=>({...x,isActive:x.isActive===1||x.isActive===true})));
      setSchedule({...s.data,breakStart:s.data.breakStart??'',breakEnd:s.data.breakEnd??''});
    }catch(e){setError(e instanceof Error?e.message:t.error);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();},[load]);
  const setField=(key:keyof Profile,value:string)=>setProfile((p)=>p?({...p,[key]:value}):p);

  const saveProfile=async()=>{
    if(!profile)return;
    setBusy(true);setError('');setMessage('');
    try{
      const r=await fetch('/api/admin/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...profile,hold_minutes:Number(profile.hold_minutes)})});
      const data:any=await r.json();if(!r.ok)throw new Error(data.error?.message??t.saveError);
      setMessage(t.profileSaved);
    }catch(e){setError(e instanceof Error?e.message:t.saveError);}
    finally{setBusy(false);}
  };

  const saveCategories=async()=>{
    setBusy(true);setError('');setMessage('');
    try{
      const r=await fetch('/api/admin/categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({categories})});
      const data:any=await r.json();if(!r.ok)throw new Error(data.error?.message??t.saveError);
      setMessage(t.categoriesSaved);await load();
    }catch(e){setError(e instanceof Error?e.message:t.saveError);}
    finally{setBusy(false);}
  };

  const editCategory=(index:number,patch:Partial<Category>)=>setCategories((items)=>items.map((item,i)=>i===index?{...item,...patch}:item));
  const addCategory=()=>setCategories((items)=>[...items,{code:`CUSTOM_${items.length+1}`,sortOrder:items.length+1,nameEn:'New vehicle',nameHi:'नया वाहन',cylinderCount:1,basePricePaise:0,gstRateBps:1800,advancePaise:null,isActive:true}]);

  const changeSchedule=(patch:Partial<Schedule>)=>setSchedule((current)=>{
    if(!current)return current;
    const next={...current,...patch};
    if(['openTime','closeTime','slotDurationMinutes','dailyCapacity','breakStart','breakEnd'].some((key)=>key in patch)){
      next.slots=createSlots(next);
    }
    return next;
  });

  const saveSchedule=async()=>{
    if(!schedule)return;
    const total=schedule.slots.reduce((sum,slot)=>sum+Number(slot.capacity),0);
    if(total!==Number(schedule.dailyCapacity)){setError(`${t.invalidCapacity} ${t.capacityTotal}: ${total}/${schedule.dailyCapacity}`);return;}
    setBusy(true);setError('');setMessage('');
    try{
      const payload={...schedule,breakStart:schedule.breakStart||null,breakEnd:schedule.breakEnd||null,dailyCapacity:Number(schedule.dailyCapacity),slotDurationMinutes:Number(schedule.slotDurationMinutes),slots:schedule.slots.map((slot)=>({...slot,capacity:Number(slot.capacity)}))};
      const r=await fetch('/api/admin/schedule',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const data:any=await r.json();if(!r.ok)throw new Error(data.error?.message??t.saveError);
      setEffectiveFrom(data.data.effectiveFrom??'');setMessage(t.scheduleSaved);await load();
    }catch(e){setError(e instanceof Error?e.message:t.saveError);}
    finally{setBusy(false);}
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
      <div className="owner-section-head"><div><p className="admin-eyebrow">02 / COMMERCIALS</p><h2 className="admin-section-title">{t.vehicles}</h2></div><div className="admin-actions"><button className="admin-button secondary" onClick={addCategory}>{t.addCategory}</button><button className="admin-button" disabled={busy} onClick={saveCategories}>{t.saveCategories}</button></div></div>
      <div className="owner-category-list">{categories.map((item,index)=><div className="owner-category" key={item.code}>
        <div className="owner-category-head"><strong>{item.nameEn||item.code}</strong><label className="admin-check"><input type="checkbox" checked={item.isActive} onChange={e=>editCategory(index,{isActive:e.target.checked})}/>{t.active}</label></div>
        <div className="owner-grid">
          <label className="admin-field">{t.categoryCode}<input className="admin-input" value={item.code} onChange={e=>editCategory(index,{code:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,'_')})}/></label>
          <label className="admin-field">{t.displayEn}<input className="admin-input" value={item.nameEn} onChange={e=>editCategory(index,{nameEn:e.target.value})}/></label>
          <label className="admin-field">{t.displayHi}<input className="admin-input" value={item.nameHi} onChange={e=>editCategory(index,{nameHi:e.target.value})}/></label>
          <label className="admin-field">{t.cylinders}<input className="admin-input" type="number" min="1" max="20" value={item.cylinderCount} onChange={e=>editCategory(index,{cylinderCount:Number(e.target.value)})}/></label>
          <label className="admin-field">{t.base}<input className="admin-input" type="number" min="0" step="0.01" value={inr(item.basePricePaise)} onChange={e=>editCategory(index,{basePricePaise:paise(e.target.value)??0})}/></label>
          <label className="admin-field">{t.gst}<input className="admin-input" type="number" min="0" max="28" step="0.01" value={item.gstRateBps/100} onChange={e=>editCategory(index,{gstRateBps:Math.round(Number(e.target.value)*100)})}/></label>
          <label className="admin-field">{t.advance}<input className="admin-input" type="number" min="0" step="0.01" value={inr(item.advancePaise)} onChange={e=>editCategory(index,{advancePaise:paise(e.target.value)})}/></label>
        </div>
      </div>)}</div>
      <p className="admin-note">{t.addHint}</p>
    </section>

    {schedule&&<section className="admin-card owner-section">
      <div className="owner-section-head"><div><p className="admin-eyebrow">03 / OPERATIONS</p><h2 className="admin-section-title">{t.schedule}</h2></div><button className="admin-button" disabled={busy} onClick={saveSchedule}>{t.saveSchedule}</button></div>
      <div className="owner-grid owner-schedule-grid">
        <label className="admin-field">{t.open}<input className="admin-input" type="time" value={schedule.openTime} onChange={e=>changeSchedule({openTime:e.target.value})}/></label>
        <label className="admin-field">{t.close}<input className="admin-input" type="time" value={schedule.closeTime} onChange={e=>changeSchedule({closeTime:e.target.value})}/></label>
        <label className="admin-field">{t.duration}<input className="admin-input" type="number" min="30" max="240" step="30" value={schedule.slotDurationMinutes} onChange={e=>changeSchedule({slotDurationMinutes:Number(e.target.value)})}/></label>
        <label className="admin-field">{t.daily}<input className="admin-input" type="number" min="1" max="1000" value={schedule.dailyCapacity} onChange={e=>changeSchedule({dailyCapacity:Number(e.target.value)})}/></label>
        <label className="admin-field">{t.breakStart}<input className="admin-input" type="time" value={schedule.breakStart??''} onChange={e=>changeSchedule({breakStart:e.target.value||null})}/></label>
        <label className="admin-field">{t.breakEnd}<input className="admin-input" type="time" value={schedule.breakEnd??''} onChange={e=>changeSchedule({breakEnd:e.target.value||null})}/></label>
      </div>
      <div className="owner-days"><strong>{t.workingDays}</strong><div className="owner-day-list">{t.days.map((day,index)=><label key={day} className="admin-check"><input type="checkbox" checked={schedule.workingDays.includes(index)} onChange={e=>setSchedule(s=>s?({...s,workingDays:e.target.checked?[...s.workingDays,index]:s.workingDays.filter(x=>x!==index)}):s)}/>{day}</label>)}</div></div>
      <div className="owner-slot-table">
        <div className="owner-slot-heading"><strong>{t.slots}</strong><strong>{t.capacityTotal}: {schedule.slots.reduce((sum,slot)=>sum+Number(slot.capacity),0)} / {schedule.dailyCapacity}</strong></div>
        {schedule.slots.map((slot,index)=><div className="owner-slot-row" key={index}><span>{slot.startTime} - {slot.endTime}</span><label className="admin-field">{t.slotCapacity}<input className="admin-input" type="number" min="0" max="1000" value={slot.capacity} onChange={e=>setSchedule(s=>s?({...s,slots:s.slots.map((x,i)=>i===index?({...x,capacity:Number(e.target.value)}):x)}):s)}/></label></div>)}
        {!schedule.slots.length&&<p className="admin-alert error">{t.noSlots}</p>}
      </div>
      <p className="admin-note">{t.note}</p>
    </section>}
  </div>;
}
