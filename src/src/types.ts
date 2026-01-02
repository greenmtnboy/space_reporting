export interface Launch {
  flight_id: string
  launch_tag: string
  success_flag: string
  launch_date: string
  site_latitude: number
  site_longitude: number
  launch_org: string
  orb_pay: number
  vehicle_name: string | null
}

export interface Stats {
  name: string
  successes: number
  failures: number
  total: number
}

export type OrgStats = Stats
export type VehicleStats = Stats
