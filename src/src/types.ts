export interface Launch {
  flight_id: string
  launch_tag: string
  success_flag: string
  launch_date: string
  site_name: string
  site_latitude: number
  site_longitude: number
  launch_org: string
  launch_state: string
  state_color: string
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

// Satellite types
export interface Satellite {
  jcat: string                    // unique ID
  name: string
  launch_date: string             // "2025-12-26 00:00:00"
  end_date: string              // "2026-01-05"
  owner_e_name: string            // organization
  owner_color: string             // hex color from data
  perigee: number                 // km (can be negative for escape trajectories)
  apogee: number                  // km (can be Infinity for escape)
  inc: number                     // inclination in degrees
  launch_site_latitude: number
  launch_site_longitude: number
}

export interface ProcessedSatellite extends Satellite {
  launchTimestamp: number
  decomTimestamp: number
  orbitType: 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'ESCAPE'
}

export type SatelliteState = 'pending' | 'launching' | 'active' | 'decommissioning' | 'decommissioned'

export interface ActiveSatellite extends ProcessedSatellite {
  state: SatelliteState
  launchProgress: number          // 0-1 for launch track (point rising to orbit)
  orbitProgress: number           // 0-1 for first orbit trace, then stays at 1
  decomProgress: number           // 0-1 for decommission animation
}

export type SatelliteStats = Stats
export type OrbitTypeStats = Stats
