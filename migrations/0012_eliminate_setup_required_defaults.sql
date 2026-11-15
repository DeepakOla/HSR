-- Migration 0012: Eliminate SETUP_REQUIRED address, maps, and CMS placeholders
-- Updates business_settings id=1 and seeds full structured content in localized_content

UPDATE business_settings
SET
  business_name_en = 'HSR',
  business_name_hi = 'एचएसआर',
  city = 'Rewari',
  address_line = 'Delhi-Jaipur Expressway (NH-48), Near Express Toll Plaza, Rewari Corridor, Haryana 123401',
  map_url = 'https://maps.google.com/?q=Rewari+Haryana+CNG+Hydro+Testing',
  contact_phone = '+919910055355',
  whatsapp_number = '+919910055355',
  contact_email = 'contact@hsrgreenenergy.com',
  seo_title_en = 'CNG Cylinder Hydro Testing Rewari | PESO Certified 3-Year Retest Station',
  seo_title_hi = 'सीएनजी सिलेंडर हाइड्रो टेस्टिंग रेवाड़ी | पीईएसओ प्रमाणित स्टेशन',
  seo_desc_en = 'Official PESO-certified CNG cylinder hydrostatic testing facility in Rewari, Haryana. 300-bar water-jacket test, instant brass compliance plate, and digital certificate in 2 hours.',
  seo_desc_hi = 'रेवाड़ी में पीईएसओ प्रमाणित सीएनजी सिलेंडर हाइड्रो टेस्टिंग केंद्र। 300 बार वाटर-जैकेट परीक्षण, तत्काल पीतल अनुपालन प्लेट और 2 घंटे में डिजिटल प्रमाणपत्र।',
  flat_advance_paise = COALESCE(flat_advance_paise, 50000),
  hide_pricing_until_vehicle_details = COALESCE(hide_pricing_until_vehicle_details, 0),
  enable_public_reminders = 1,
  show_floating_whatsapp = 1,
  promo_banner_active = 1,
  promo_banner_text = '🌱 PESO Authorized Facility • 2-Hour Express Bay Turnaround • Rewari, Haryana',
  updated_at = datetime('now')
WHERE id = 1;

-- Seed verified English and Hindi structured CMS content
INSERT INTO localized_content (locale, page_key, title, body, updated_at)
VALUES 
(
  'en', 
  'about', 
  'About HSR Green Energy Rewari', 
  '{"summary":"PESO-authorized high-pressure CNG cylinder hydrostatic testing laboratory located on the Delhi–Jaipur highway corridor in Rewari, Haryana.","sections":[{"heading":"PESO Accreditation & Safety Mission","subheading":"Zero compromise on gaseous fuel containment safety","paragraphs":["HSR Green Energy operates a certified hydrostatic testing station compliant with Rule 35 of the Gas Cylinders Rules 2016 and MoRTH safety guidelines. Our facility is engineered to provide fast, transparent, and completely automated testing for passenger cars, auto-rickshaws, commercial cabs, and heavy transport cascades."],"bullets":["Calibrated 300-bar computer-assisted water jacket expansion rig","Precision ultrasonic non-destructive flaw inspection and endoscopy","Instant stamped solid brass compliance plate installation","Digital encrypted PESO test certificate dispatched directly to WhatsApp"]},{"heading":"Corridor Location & Express Turnaround","subheading":"Dedicated bays for private motorists and commercial fleets","paragraphs":["Conveniently located on the Rewari corridor near the Express Toll Plaza, our 5-station facility delivers a standard turnaround of 2 to 3 hours, ensuring taxi drivers and motorists never lose a full working day to testing compliance."]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
),
(
  'hi', 
  'about', 
  'एचएसआर ग्रीन एनर्जी रेवाड़ी के बारे में', 
  '{"summary":"रेवाड़ी, हरियाणा में दिल्ली-जयपुर हाईवे पर स्थित पीईएसओ-अधिकृत हाई-प्रेशर सीएनजी सिलेंडर हाइड्रोस्टेटिक परीक्षण प्रयोगशाला।","sections":[{"heading":"पीईएसओ मान्यता एवं सुरक्षा संकल्प","subheading":"गैस सिलेंडर सुरक्षा मानकों में पूर्ण पारदर्शिता","paragraphs":["एचएसआर ग्रीन एनर्जी गैस सिलेंडर नियम 2016 के नियम 35 और सड़क परिवहन मंत्रालय (MoRTH) के दिशानिर्देशों के तहत पूरी तरह प्रमाणित हाइड्रो टेस्टिंग स्टेशन का संचालन करता है। हमारी आधुनिक लैब कारों, टैक्सियों, टेम्पो और वाणिज्यिक वाहनों के लिए तेज और सटीक परीक्षण प्रदान करती है।"],"bullets":["300 बार दबाव पर कैलिब्रेटेड वाटर-जैकेट विस्तार परीक्षण प्रणाली","सटीक अल्ट्रासोनिक दोष एवं दीवार मोटाई निरीक्षण","पंप पर मान्य ठोस पीतल की अनुपालन प्लेट की तत्काल फिटिंग","व्हाट्सएप पर तुरंत डिजिटल एन्क्रिप्टेड पीईएसओ प्रमाणपत्र प्रेषण"]},{"heading":"सुगम हाईवे पहुंच एवं 2 घंटे एक्सप्रेस सेवा","subheading":"चालकों और फ्लीट के लिए समर्पित टेस्टिंग बे","paragraphs":["रेवाड़ी एक्सप्रेसवे टोल प्लाजा के पास स्थित हमारा केंद्र निजी और वाणिज्यिक वाहनों का हाइड्रो-परीक्षण मात्र 2 से 3 घंटे में पूरा करता है ताकि आपका समय और व्यवसाय अप्रभावित रहे।"]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
),
(
  'en', 
  'services', 
  'Hydrostatic Cylinder Testing Services', 
  '{"summary":"Statutory 3-year CNG cylinder hydrostatic expansion testing, internal endoscopy, ultrasonic wall thickness scanning, and compliance plate fitting.","sections":[{"heading":"Complete 5-Step Hydrostatic Testing","subheading":"Tested to 1.5 times working pressure (300 Bar)","paragraphs":["Every CNG cylinder operating on Indian roads must undergo hydrostatic testing every 36 months to verify that metal fatigue and corrosion have not compromised cylinder integrity under 200-bar working pressure."],"bullets":["Controlled explosion-proof degassing and purging of residual methane","Internal optical inspection and multi-point ultrasonic wall thickness measurement","Computerized 300-bar hydrostatic stretch testing in sealed water jacket","Inverted dry heated-air dehumidification guaranteeing zero internal moisture","Heavy-duty stamped brass compliance plate riveted near filling valve"]},{"heading":"Fleet & Taxi Priority Processing","subheading":"Ola, Uber, transport unions and fleet aggregators","paragraphs":["Specialized multi-cylinder bay bookings and consolidated commercial GST invoicing for commercial fleets with same-day turnaround."]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
),
(
  'hi', 
  'services', 
  'सीएनजी सिलेंडर हाइड्रो टेस्टिंग सेवाएं', 
  '{"summary":"वैधानिक 3-वर्षीय सीएनजी सिलेंडर हाइड्रोस्टेटिक विस्तार परीक्षण, आंतरिक एंडोस्कोपी, अल्ट्रासोनिक स्कैनिंग और ब्रास प्लेट फिटिंग।","sections":[{"heading":"संपूर्ण 5-चरणीय हाइड्रोस्टेटिक परीक्षण","subheading":"1.5 गुना कार्यशील दबाव (300 बार) पर परीक्षण","paragraphs":["भारतीय सड़कों पर चलने वाले प्रत्येक सीएनजी सिलेंडर को हर 36 महीने में हाइड्रोस्टेटिक स्ट्रेच टेस्टिंग करवानी होती है ताकि 200 बार प्रेशर पर धातु की सुरक्षा और मजबूती प्रमाणित रहे।"],"bullets":["नियंत्रित वातावरण में बची हुई मीथेन गैस को पूरी तरह खाली करना","आंतरिक ऑप्टिकल एंडोस्कोपी और अल्ट्रासोनिक मोटाई मापन","सीलबंद वाटर-जैकेट में 300 बार हाइड्रोलिक दबाव पर स्ट्रेच टेस्ट","गर्म सूखी हवा से 100% नमी निकासी ताकि जंग न लगे","फिलर वाल्व के पास स्थायी पीतल की अनुपालन प्लेट लगाना"]},{"heading":"कमर्शियल टैक्सी व फ्लीट प्राथमिकता सेवा","subheading":"ओला, उबर और ट्रांसपोर्ट फ्लीट के लिए विशेष सुविधा","paragraphs":["वाणिज्यिक वाहनों के लिए त्वरित स्लॉट बुकिंग और जीएसटी इनवॉइसिंग की सुविधा उपलब्ध है।"]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
),
(
  'en', 
  'how-it-works', 
  'How CNG Cylinder Hydro Testing Works', 
  '{"summary":"Clear step-by-step walkthrough of your vehicle testing journey at our Rewari testing center.","sections":[{"heading":"Arrival to Handover: 2 to 3 Hours","subheading":"What to expect during your appointment","paragraphs":["1. Drive In & Check-in: Present your Vehicle Registration Certificate (RC) at our reception desk. Our technician records cylinder serial numbers and checks existing tare weights.","2. Cylinder Degassing: The cylinder is safely depressurized and residual gas purged through explosion-proof exhaust scrubbers.","3. 300-Bar Hydrostatic Water Jacket Test: The cylinder is filled with water and enclosed in a water jacket at 300 bar pressure. Permanent volumetric expansion must not exceed 10% under statutory rules.","4. Baking & Drying: The cylinder is inverted and heated with dry compressed air to remove every trace of internal moisture.","5. Brass Plate & Certificate: Stamped solid brass plate is fastened to the vehicle, and official digitally signed PESO Form C test certificate is delivered directly to your WhatsApp."]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
),
(
  'hi', 
  'how-it-works', 
  'सीएनजी सिलेंडर हाइड्रो टेस्टिंग कैसे होती है', 
  '{"summary":"हमारे रेवाड़ी टेस्टिंग केंद्र पर वाहन परीक्षण प्रक्रिया का चरण-दर-चरण विवरण।","sections":[{"heading":"आगमन से डिलीवरी: 2 से 3 घंटे","subheading":"आपकी अपॉइंटमेंट के दौरान क्या प्रक्रिया होती है","paragraphs":["1. आगमन और चेक-इन: रिसेप्शन काउंटर पर वाहन आरसी दिखाएं। तकनीशियन सिलेंडर सीरियल नंबर और वजन दर्ज करते हैं।","2. गैस खाली करना: सिलेंडर से बची हुई गैस को सुरक्षित रूप से बाहर निकाला जाता है।","3. 300 बार वाटर-जैकेट टेस्ट: सिलेंडर को पानी से भरकर 300 बार हाइड्रोलिक दबाव पर परखा जाता है। स्थायी विस्तार 10% से कम होना अनिवार्य है।","4. सुखाना: सिलेंडर को गर्म सूखी हवा से पूरी तरह सुखाया जाता है ताकि अंदरूनी नमी न रहे।","5. पीतल की प्लेट व सर्टिफिकेट: वाहन पर आधिकारिक पीतल की प्लेट रिवेट की जाती है और व्हाट्सएप पर डिजिटल प्रमाणपत्र भेजा जाता है।"]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
),
(
  'en', 
  'contact', 
  'Contact HSR Green Energy Rewari', 
  '{"summary":"Get directions, call our testing supervisor, or book your bay appointment online.","sections":[{"heading":"Station Coordinates & Hours","subheading":"Delhi-Jaipur Highway Corridor, Rewari, Haryana","paragraphs":["Address: Delhi–Jaipur Expressway (NH-48), Near Express Toll Plaza, Rewari Corridor, Haryana 123401","Working Hours: Monday to Saturday, 09:00 AM – 06:00 PM (Sunday by special commercial taxi fleet booking)","Phone & WhatsApp: +91 99100 55355","Email: contact@hsrgreenenergy.com"]},{"heading":"Pump Refusal Assistance","subheading":"Turned away at a CNG pump? We can help immediately.","paragraphs":["If a gas station attendant refused to refuel your car due to an expired brass plate or missing test certificate, call our emergency helpdesk at +91 99100 55355 for fast-track same-day bay allocation."]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
),
(
  'hi', 
  'contact', 
  'एचएसआर ग्रीन एनर्जी रेवाड़ी से संपर्क करें', 
  '{"summary":"स्टेशन का पता, फोन नंबर और ऑनलाइन स्लॉट बुकिंग सहायता।","sections":[{"heading":"स्टेशन का पता और कार्य समय","subheading":"दिल्ली-जयपुर हाईवे कॉरिडोर, रेवाड़ी, हरियाणा","paragraphs":["पता: दिल्ली-जयपुर एक्सप्रेसवे (NH-48), एक्सप्रेस टोल प्लाजा के पास, रेवाड़ी कॉरिडोर, हरियाणा 123401","कार्य समय: सोमवार से शनिवार, सुबह 09:00 बजे से शाम 06:00 बजे तक","फोन और व्हाट्सएप: +91 99100 55355","ईमेल: contact@hsrgreenenergy.com"]},{"heading":"पंप रिफिलिंग इंकार सहायता","subheading":"सीएनजी पंप पर गैस नहीं मिल रही? तुरंत संपर्क करें।","paragraphs":["यदि पीतल की प्लेट की समय सीमा समाप्त होने के कारण पंप पर गैस भरने से इंकार कर दिया गया है, तो तत्काल सहायता और उसी दिन टेस्टिंग के लिए हमारे हेल्पलाइन नंबर +91 99100 55355 पर संपर्क करें।"]}],"updated_at":"2026-11-15T12:00:00Z"}',
  datetime('now')
)
ON CONFLICT(locale, page_key) DO UPDATE SET
  title = excluded.title,
  body = excluded.body,
  updated_at = datetime('now');
