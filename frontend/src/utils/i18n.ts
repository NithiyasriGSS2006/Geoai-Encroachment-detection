export type Language = 'en' | 'ta' | 'hi';

export interface Translations {
  govtHeader: string;
  portalTitle: string;
  subtitle: string;
  skipToContent: string;
  screenReader: string;
  highContrast: string;
  textSize: string;
  ssoLogin: string;
  ssoModalTitle: string;
  ssoModalDesc: string;
  digiLockerVerify: string;
  feedbackButton: string;
  feedbackModalTitle: string;
  feedbackSubmit: string;
  languageName: string;
  offlineStatus: string;
  onlineStatus: string;
  centralContentNotice: string;
  step0Title: string;
  step1Title: string;
  step2Title: string;
  step3Title: string;
  step4Title: string;
  step5Title: string;
  startAnalysis: string;
  downloadGeoTIFF: string;
  downloadCSV: string;
  downloadJSON: string;
  studyAreaLabel: string;
  lastUpdated: string;
  contentOwner: string;
  gigwCompliantBadge: string;
  shareTitle: string;
  shareCopied: string;
}

export const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    govtHeader: 'Government of Tamil Nadu • CMDA Official Portal',
    portalTitle: 'Velachery GeoAI Water & Encroachment Monitor',
    subtitle: 'Chennai Metropolitan Development Authority — Satellite Raster Analytics & LULC Encroachment Monitoring System',
    skipToContent: 'Skip to Main Content',
    screenReader: 'Screen Reader',
    highContrast: 'High Contrast',
    textSize: 'Text Size',
    ssoLogin: 'MeriPehchaan SSO Login',
    ssoModalTitle: 'MeriPehchaan (NSSO) Single Sign-On',
    ssoModalDesc: 'Government Officials, Registered Planners, and Citizens can authenticate securely via MeriPehchaan or DigiLocker.',
    digiLockerVerify: 'Verify via DigiLocker',
    feedbackButton: 'Public Feedback & Grievance',
    feedbackModalTitle: 'Citizen Feedback & Encroachment Grievance Redressal',
    feedbackSubmit: 'Submit Official Feedback',
    languageName: 'English',
    offlineStatus: 'Offline Cache Active',
    onlineStatus: 'Online Sync Active',
    centralContentNotice: 'Central Content System: TNCDBR 2019 Lakebed Protection Guidelines Active for CMA Zone 10',
    step0Title: '① Multi-Year Input',
    step1Title: '② Step 1: Water Change',
    step2Title: '③ Step 2: Persistent Encroachment',
    step3Title: '④ Step 3: LULC Analysis',
    step4Title: '⑤ Step 4: Potential Encroachment',
    step5Title: '✓ Analysis Summary',
    startAnalysis: 'Start Analysis',
    downloadGeoTIFF: 'Download GeoTIFF',
    downloadCSV: 'Download CSV Report',
    downloadJSON: 'Download JSON Summary',
    studyAreaLabel: 'Study Area: Velachery Lake & Marshland, Chennai',
    lastUpdated: 'Last Updated: October 01, 2026',
    contentOwner: 'Content Owned & Maintained by Chennai Metropolitan Development Authority (CMDA)',
    gigwCompliantBadge: 'GIGW 3.0 & DBIM Compliant',
    shareTitle: 'Share Portal Link',
    shareCopied: 'Link Copied to Clipboard!',
  },
  ta: {
    govtHeader: 'தமிழ்நாடு அரசு • சென்னை பெருநகர் வளர்ச்சி குழுமம் (CMDA)',
    portalTitle: 'வேளச்சேரி GeoAI நீர்நிலை & ஆக்கிரமிப்பு கண்காணிப்பு',
    subtitle: 'சென்னை பெருநகர் வளர்ச்சி குழுமம் — செயற்கைக்கோள் நிலப்பரப்பு மற்றும் ஆக்கிரமிப்பு பகுப்பாய்வு மையம்',
    skipToContent: 'முக்கிய உள்ளடக்கத்திற்குச் செல்லவும்',
    screenReader: 'திரை வாசகர் பயன்பாடு',
    highContrast: 'உயர் மாறுபாடு அமைவு',
    textSize: 'எழுத்து அளவு',
    ssoLogin: 'மெரிபெஹ்சான் SSO உள்நுழைவு',
    ssoModalTitle: 'மெரிபெஹ்சான் (NSSO) ஒற்றை உள்நுழைவு மையம்',
    ssoModalDesc: 'அரசு அதிகாரிகள், பதிவுசெய்த திட்டமிடுபவர்கள் மற்றும் பொதுமக்கள் பாதுகாப்பாக உள்நுழையலாம்.',
    digiLockerVerify: 'டிஜிலாக்கர் சான்றிதழ் சரிபார்ப்பு',
    feedbackButton: 'பொதுமக்கள் கருத்து & குறைதீர்ப்பு',
    feedbackModalTitle: 'பொதுமக்கள் கருத்து மற்றும் நீர்நிலை ஆக்கிரமிப்பு புகார் பதிவு',
    feedbackSubmit: 'அதிகாரப்பூர்வ புகாரை சமர்ப்பிக்குக',
    languageName: 'தமிழ்',
    offlineStatus: 'ஆஃப்லைன் சேமிப்பு தயார்',
    onlineStatus: 'இணைப்பு செயலில் உள்ளது',
    centralContentNotice: 'மத்திய அறிவிப்பு மையம்: TNCDBR 2019 நீர்நிலை பாதுகாப்பு விதிகள் வேளச்சேரி பகுதிக்கு அமலில் உள்ளன',
    step0Title: '① பன்முக ஆண்டு உள்ளீடு',
    step1Title: '② நிலை 1: நீர் மாற்றம்',
    step2Title: '③ நிலை 2: நிலையான ஆக்கிரமிப்பு',
    step3Title: '④ நிலை 3: நில பயன்பாட்டு பகுப்பாய்வு',
    step4Title: '⑤ நிலை 4: சாத்தியமான ஆக்கிரமிப்பு',
    step5Title: '✓ பகுப்பாய்வு சுருக்கம்',
    startAnalysis: 'பகுப்பாய்வைத் தொடங்கு',
    downloadGeoTIFF: 'GeoTIFF பதிவிறக்கு',
    downloadCSV: 'CSV அறிக்கை பதிவிறக்கு',
    downloadJSON: 'JSON சுருக்கம் பதிவிறக்கு',
    studyAreaLabel: 'ஆய்வு பகுதி: வேளச்சேரி ஏரி & சதுப்புநிலம், சென்னை',
    lastUpdated: 'கடைசியாக புதுப்பிக்கப்பட்டது: அக்டோபர் 01, 2026',
    contentOwner: 'உள்ளடக்க உரிமையாளர்: சென்னை பெருநகர் வளர்ச்சி குழுமம் (CMDA)',
    gigwCompliantBadge: 'GIGW 3.0 & DBIM சான்றளிக்கப்பட்டது',
    shareTitle: 'இணைப்பைப் பகிரவும்',
    shareCopied: 'இணைப்பு நகலெடுக்கப்பட்டது!',
  },
  hi: {
    govtHeader: 'तमिलनाडु सरकार • चेन्नई महानगर विकास प्राधिकरण (CMDA)',
    portalTitle: 'वेलाचेरी जियो-एआई जल एवं अतिक्रमण निगरानी पोर्टल',
    subtitle: 'चेन्नई महानगर विकास प्राधिकरण — उपग्रह रास्टर विश्लेषण एवं भूमि उपयोग अतिक्रमण निगरानी प्रणाली',
    skipToContent: 'मुख्य सामग्री पर जाएं',
    screenReader: 'स्क्रीन रीडर पहुंच',
    highContrast: 'उच्च कंट्रास्ट थीम',
    textSize: 'पाठ आकार',
    ssoLogin: 'मेरीपहचान एसएसओ लॉगिन',
    ssoModalTitle: 'मेरीपहचान (NSSO) सिंगल साइन-ऑन',
    ssoModalDesc: 'सरकारी अधिकारी, पंजीकृत योजनाकार और नागरिक मेरीपहचान या डिजिलॉकर के माध्यम से लॉगिन कर सकते हैं।',
    digiLockerVerify: 'डिजिलॉकर सत्यापन',
    feedbackButton: 'नागरिक प्रतिक्रिया एवं शिकायत',
    feedbackModalTitle: 'नागरिक प्रतिक्रिया एवं जल निकाय अतिक्रमण निवारण पोर्टल',
    feedbackSubmit: 'आधिकारिक शिकायत दर्ज करें',
    languageName: 'हिन्दी',
    offlineStatus: 'ऑफलाइन कैश सक्रिय',
    onlineStatus: 'ऑनलाइन सिंक सक्रिय',
    centralContentNotice: 'केंद्रीय सामग्री प्रणाली: TNCDBR 2019 जल निकाय संरक्षण नियम सीएमए जोन 10 के लिए प्रभावी हैं',
    step0Title: '① बहु-वर्षीय इनपुट',
    step1Title: '② चरण 1: जल परिवर्तन',
    step2Title: '③ चरण 2: निरंतर अतिक्रमण क्षेत्र',
    step3Title: '④ चरण 3: एलयूएलसी विश्लेषण',
    step4Title: '⑤ चरण 4: संभावित अतिक्रमण',
    step5Title: '✓ विश्लेषण सारांश',
    startAnalysis: 'विश्लेषण शुरू करें',
    downloadGeoTIFF: 'GeoTIFF डाउनलोड करें',
    downloadCSV: 'CSV रिपोर्ट डाउनलोड करें',
    downloadJSON: 'JSON सारांश डाउनलोड करें',
    studyAreaLabel: 'अध्ययन क्षेत्र: वेलाचेरी झील एवं दलदल, चेन्नई',
    lastUpdated: 'अंतिम अद्यतन: 01 अक्टूबर 2026',
    contentOwner: 'सामग्री स्वामित्व: चेन्नई महानगर विकास प्राधिकरण (CMDA)',
    gigwCompliantBadge: 'GIGW 3.0 एवं DBIM अनुपालन',
    shareTitle: 'पोर्टल लिंक साझा करें',
    shareCopied: 'क्लिपबोर्ड पर लिंक कॉपी किया गया!',
  },
};
