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
}

export interface Project {
  id: string;
  name: string;
  location: string;
  abbreviation: string;
  engineerIds: string[];
  supervisorIds: string[];
  createdAt: string;
}

export interface Client {
  id: string;
  projectId: string;
  name: string;
  phone: string;
  villaNumber: string;
  blockNumber?: string;
  handoverDate?: string;
  warrantyExpiryDate?: string;
}

export type TicketType = 'electricity' | 'plumbing' | 'doors' | 'paints' | 'cracks' | 'ceramics' | 'tank_insulation';

export interface Ticket {
  id: string;
  ticketId: string; // The display ID like 182787
  refNumber: string; // Like NTF-685 (projectAbbr + villaNumber)
  projectAbbr?: string; // e.g. 'NTF' extracted from refNumber
  projectId: string;
  clientId: string;
  clientName: string; // Store name for quick search/display as in example
  villaNumber: string;
  issuedAt?: string; // Original issue date from file e.g. '15/3/2025'
  description: string;
  type: TicketType;
  status: 'open' | 'in-progress' | 'pending' | 'completed' | 'closed' | 'waiting';
  priority: 'low' | 'medium' | 'high' | 'urgent' | number; // Support numbers 3, 4, 6, 7, 9
  assigneeName?: string;
  assignedSupervisorId?: string;
  assignedSupervisorIds?: string[];   // all auto-assigned supervisors
  assignedSupervisors?: { id: string; name: string; specialty?: string }[];
  detectedTypes?: string[];           // all classified ticket types
  appointmentTime?: string;
  appointmentNotes?: string;
  createdAt: any; // Using any for Firestore Timestamp
  closedAt?: any;
  closureNotes?: string;
  maintenanceItems?: { description: string; status: string }[];
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
