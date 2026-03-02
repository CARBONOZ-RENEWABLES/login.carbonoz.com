export interface TotalEnergyInterface {
  id: string;
  pvPower: string;
  loadPower: string;
  gridIn: string;
  gridOut: string;
  batteryCharged: string;
  batteryDischarged: string;
  date: string;
  topic: string | null;
  port: string | null;
  userId: string;
}
