export type SupplierLead = {
  id: string
  displayName: string
  legalName: string
  abn: string
  gstRegistered: boolean
  location: string
  phone: string
  email?: string
  website: string
  categories: string[]
  serviceArea: string
  deliveryNotes: string
  certificationClaims: string[]
  paymentTerms?: string
  abnEvidenceUrl: string
  evidenceUrls: string[]
  halal?: boolean
  mapPoint?: { latitude: number; longitude: number; precision: 'suburb-centroid' }
}

// Approximate suburb centroids support the sample proximity view. They are not address geocodes.
export const supplierLeads: SupplierLead[] = [
  {
    id:'poultry-n-more',displayName:'Poultry N More',legalName:'POULTRY N MORE (AUST) PTY LTD',abn:'42 142 888 015',gstRegistered:true,
    location:'Factory 1 & 2, 220 Old Geelong Road, Hoppers Crossing VIC 3029',phone:'03 9748 4500',website:'https://poultrynmore.com.au/',
    categories:['Poultry','Chicken','Meat'],serviceArea:'All Victorian suburbs',deliveryNotes:'Website claims daily Victorian delivery; product PDF says orders before 5 pm for next-day delivery.',
    certificationClaims:['HACCP system','Halal products','Refrigerated vehicles'],halal:true,mapPoint:{latitude:-37.8826,longitude:144.7003,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View/42142888015',evidenceUrls:['https://poultrynmore.com.au/about/','https://poultrynmore.com.au/wp-content/uploads/2023/08/PNM-Products-List.pdf'],
  },
  {
    id:'nice-n-fresh',displayName:'Nice N Fresh Poultry Supplies',legalName:'TOP CHOICE FOODS PTY LTD',abn:'32 682 759 995',gstRegistered:true,
    location:'497 Mountain Highway, Bayswater VIC 3153',phone:'03 9720 2288',email:'sales@nicenfresh.com.au',website:'https://nicenfresh.com.au/',
    categories:['Poultry','Chicken','Meat','Crumbed products'],serviceArea:'Victoria',deliveryNotes:'Website describes a Victorian distribution network serving butchers, supermarkets, restaurants, cafés and foodservice.',
    certificationClaims:[],mapPoint:{latitude:-37.8413,longitude:145.2667,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View?abn=32682759995',evidenceUrls:[],
  },
  {
    id:'tip-top-meats',displayName:'Tip Top Meats',legalName:'THE TRUSTEE FOR THE TIP TOP BUTCHERS TRUST',abn:'38 204 135 272',gstRegistered:true,
    location:'10 Raymond Road, Laverton North VIC 3026',phone:'03 9368 4500',website:'https://tiptopmeats.com.au/',
    categories:['Poultry','Chicken','Beef','Lamb','Pork','Foodservice meat'],serviceArea:'Victoria-wide',deliveryNotes:'Website claims Victoria-wide cold-chain delivery for commercial kitchens.',
    certificationClaims:['HACCP certified facility','Halal certified','Supply-chain traceability','Temperature-controlled fleet'],halal:true,mapPoint:{latitude:-37.8420,longitude:144.8053,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View/38204135272',evidenceUrls:[],
  },
  {
    id:'fastrac-foodservice',displayName:'Fastrac Foodservice',legalName:'FASTRAC FOODSERVICE PTY. LTD.',abn:'97 006 683 932',gstRegistered:true,
    location:'32 Simcock Street, Somerville VIC 3912',phone:'03 5978 1000',email:'orders.somerville@fastrac.com.au',website:'https://fastrac.com.au/',
    categories:['Broadline foodservice','Frozen food','Chilled food','Dry goods','Bakery'],serviceArea:'Metro Melbourne, Mornington Peninsula, Gippsland and regional Victoria',deliveryNotes:'Orders accepted until midnight for next-day delivery to most regions; service runs six days a week.',
    certificationClaims:[],mapPoint:{latitude:-38.2232,longitude:145.1765,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View/97006683932',evidenceUrls:['https://fastrac.com.au/contact-us','https://fastrac.com.au/order'],
  },
  {
    id:'del-re-national',displayName:'Del-Re National Food Group',legalName:'DEL-RE NATIONAL FOOD GROUP PTY LTD',abn:'24 111 521 834',gstRegistered:true,
    location:'320–330 Foleys Road, Derrimut VIC 3026',phone:'03 9307 4200',email:'orders@delrenational.com.au',website:'https://www.delrenational.com.au/',
    categories:['Poultry','Meat','Seafood','Produce','Dairy','Frozen food','Dry goods','Packaging'],serviceArea:'Melbourne and regional Victoria',deliveryNotes:'Orders accepted until 5 pm for next-day delivery; website claims five-day delivery.',
    certificationClaims:['HACCP certification claimed','Temperature-controlled distribution','Traceability and recall program'],mapPoint:{latitude:-37.7994,longitude:144.7717,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View?abn=24111521834',evidenceUrls:['https://www.delrenational.com.au/our-customers','https://www.delrenational.com.au/food-safety-and-quality'],
  },
  {
    id:'delica-meats',displayName:'Delica Meats',legalName:'DELICA MEAT SUPPLY UNIT TRUST',abn:'73 534 782 748',gstRegistered:true,
    location:'St Kilda, Melbourne VIC 3182',phone:'03 9525 3477',email:'enquiries@delicameats.com.au',website:'https://www.delicameats.com.au/',
    categories:['Poultry','Chicken','Beef','Pork','Lamb','Veal','Smallgoods'],serviceArea:'Metro Melbourne and selected regional areas',deliveryNotes:'Own refrigerated delivery trucks operate five days per week.',
    certificationClaims:['Temperature-controlled delivery'],mapPoint:{latitude:-37.8676,longitude:144.9809,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View/73534782748',evidenceUrls:['https://www.delicameats.com.au/order-online','https://www.delicameats.com.au/products'],
  },
  {
    id:'fresh-choice-meats',displayName:'Fresh Choice Meats',legalName:'J & T TRANSPORT SERVICES PTY LTD',abn:'81 110 506 771',gstRegistered:true,
    location:'343 Settlement Road, Thomastown VIC 3074',phone:'03 9464 1534',email:'glenn@freshchoicemeats.com.au',website:'https://www.freshchoicemeats.com.au/',
    categories:['Poultry','Chicken','Beef','Pork','Lamb'],serviceArea:'Greater Melbourne and Victoria',deliveryNotes:'Website offers flexible wholesale delivery; timing and minimum order need direct confirmation.',
    certificationClaims:[],mapPoint:{latitude:-37.6833,longitude:145.0144,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View?abn=81110506771',evidenceUrls:['https://www.freshchoicemeats.com.au/wholesale'],
  },
  {
    id:'fruit-box-group',displayName:'The Fruit Box Group',legalName:'THE FRUIT BOX GROUP PTY LTD',abn:'24 092 238 634',gstRegistered:true,
    location:'56–62 Bakehouse Road, Kensington VIC 3031',phone:'1300 766 760',email:'service@thefruitbox.com.au',website:'https://thefruitboxgroup.com.au/',
    categories:['Fresh produce','Fruit','Tearoom supplies','Workplace food'],serviceArea:'Melbourne, Geelong and major Australian cities',deliveryNotes:'Vendor document lists Melbourne and Geelong among serviced areas.',
    certificationClaims:[],paymentTerms:'14 days',mapPoint:{latitude:-37.7935,longitude:144.9300,precision:'suburb-centroid'},abnEvidenceUrl:'https://abr.business.gov.au/ABN/View?abn=24092238634',evidenceUrls:['https://thefruitboxgroup.com.au/contact-us/','https://thefruitboxgroup.com.au/wp-content/uploads/2026/02/The-Fruit-Box-Group-Vendor-Information-2026.pdf'],
  },
]
