
export enum Sender {
  USER = 'user',
  AI = 'ai',
  SYSTEM = 'system'
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  imageUrl?: string;
  audioUrl?: string;
}

export interface LogReport {
  engineering: string[];
  supervisor: string[];
  safety: string[];
  summary: string;
}

export interface LinkedRecord {
  id: string;
  type: 'concrete'; // 可以扩展其他类型
  status: 'draft' | 'completed';
  title: string;
}

export interface LogEntry {
  id: string;
  projectId: string; 
  date: string;
  weather: string;
  location: string;
  messages: Message[];
  report: LogReport | null;
  status: 'draft' | 'completed';
  lastModified: number;
  linkedRecords?: LinkedRecord[]; // 新增关联记录字段
}

export interface ConcreteRecord {
  id: string;
  projectId: string;
  date: string;
  createdAt: number;
  status: 'draft' | 'completed';
  // Stores the answers to the 16 questions. Key is question ID (e.g., 'q1', 'q12_val1').
  data: Record<string, any>; 
}

export interface Project {
  id: string;
  name: string;
  projectNumber?: string; // Add this
  location: string;
  createdAt: number;
}

export interface User {
  username: string;
  isLoggedIn: boolean;
}

export interface WeatherInfo {
  condition: string;
  temp: string;
}

export interface ReportSchemaResponse {
  engineering: string[];
  supervisor: string[];
  safety: string[];
  summary: string;
}
