// types.ts
export type UserRole = 'admin' | 'engineer' | 'supervisor';
export type Specialty = 'mechanics' | 'electricity' | 'general';
export type ExperienceLevel = 'senior' | 'junior';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  employeeId?: string;
  phoneNumber?: string;
  specialty?: Specialty;           // legacy single value (kept for compatibility)
  specialties?: Specialty[];       // new: multiple specialties
  role: 'admin' | 'engineer' | 'supervisor';
  projectIds?: string[];
  photoURL?: string;
  profileCompleted?: boolean;
  disabled?: boolean;
  onLeave?: boolean;
  substituteUid?: string | null;
  idNumber?: string | null;
  clothingSize?: string | null;
  shoeSize?: string | null;

}

export interface Project {
  id: string;
  name: string;
  location: string;
  abbreviation: string;
  engineerIds: string[];
  supervisorIds: string[];
  createdAt: string;
  googleMapsUrl?: string;
  officeLat?: number;
  officeLng?: number;
  officeAddress?: string;
}

export interface Client {
  id: string;
  projectId?: string;
  name: string;
  phone: string;
  unitId?: string;
  unitNumber?: string;
  blockNumber?: string;
  handoverDate?: string;
  warrantyExpiryDate?: string;
  units?: any[];
}

// ✅ الأنواع القديمة + الجديدة (تمديد دون إزالة أي شيء)
export type TicketType = 
  // الأنواع القديمة (للتوافق مع البيانات الموجودة)
  | 'electricity'
  | 'plumbing'
  | 'doors'
  | 'paints'
  | 'cracks'
  | 'ceramics'
  | 'tank_insulation'
  // الأنواع الجديدة (ميكانيكا، كهرباء، عام)
  | 'drainage'           // صرف صحي وروائح
  | 'ac_ventilation'     // تكييف وتهوية ومراوح شفط
  | 'pumps'              // مضخات وعوامات
  | 'doors_windows'      // أبواب ونوافذ (موسع)
  | 'waterproofing'      // عزل مائي ورطوبة
  | 'grading'            // ميول وترويبة وهبوط
  | 'pest_control'       // مكافحة حشرات (نمل)
  | 'cleaning'           // تنظيف مخلفات
  | 'structural'         // إنشائي (أساسات، أعمدة)
  | 'painting'           // مرادف لـ paints
  | 'tiles'              // مرادف لـ ceramics
  | 'unclassified';      // غير مصنف

export interface Ticket {
  id: string;
  ticketId: string;
  projectId: string;
  unitId?: string | null;
  unitNumber?: string;
  clientId?: string | null;
  issuedAt?: string;
  description: string;
  type: TicketType;
  status: 'open' | 'in-progress' | 'in_progress' | 'pending' | 'completed' | 'closed' | 'waiting' | 'out-of-scope' | 'out_of_scope' | 'absent' | 'contractor' | 'note';
  priority: 'low' | 'medium' | 'high' | 'urgent' | number;
  assigneeName?: string;
  assignedSupervisorIds?: string[];
  // Virtual fields computed by the API from relations:
  refNumber?: string;
  unitNumber?: string;
  clientName?: string;
  projectAbbr?: string;
  assignedSupervisorId?: string;
  assignedSupervisors?: { id: string; name: string; specialty?: string }[];
  detectedTypes?: string[];
  subTypeId?: string | null;
  subTypeName?: string | null;
  appointmentTime?: string | null;
  appointmentNotes?: string | null;
  appointment?: { id: string; date: string; time?: string | null } | null;
  createdAt: any;
  closedAt?: any;
  closureNotes?: string;
  maintenanceItems?: { description: string; status: string }[];
  contractorId?: string | null;
  contractorName?: string | null;
  contractorNote?: string | null;
  appointmentId?: string | null;
}

// ─── Contractor Types ─────────────────────────────────────────────────────────
export interface ContractorSpecialty {
  id: string;
  contractorId: string;
  specialtyKey: string;
}

export interface ContractorVilla {
  id: string;
  contractorId: string;
  specialtyKey: string;
  projectId: string;
  blockId?: string | null;
  unitId?: string | null;
  // Included relations for UI mapping
  block?: { blockNumber: string } | null;
  unit?: { unitNumber: string } | null;
}

export interface Contractor {
  id: string;
  name: string;
  phone?: string | null;
  createdAt: string;
  specialties: ContractorSpecialty[];
  assignments: ContractorVilla[];
}

export interface Technician {
  id: string;
  employeeId?: string;
  phoneNumber?: string;
  specialty?: Specialty;
  experienceLevel?: ExperienceLevel;
  supervisorId: string;
  projectId: string;
  name: string;
  idNumber?: string;
  idPhotoUrl?: string;
  documentUrls?: string[];
  clothingSize?: string;
  shoeSize?: string;
}