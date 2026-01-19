import { ref, computed, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export type FilterType = 'organization' | 'vehicle' | 'owner' | 'orbitType' | 'propellant' | 'manufacturer'

export interface CrossFilterState {
  organizations: Set<string>
  vehicles: Set<string>
  owners: Set<string>
  orbitTypes: Set<string>
  propellants: Set<string>
  manufacturers: Set<string>
}

// URL query param keys
const QUERY_KEYS: Record<FilterType, string> = {
  organization: 'org',
  vehicle: 'vehicle',
  owner: 'owner',
  orbitType: 'orbit',
  propellant: 'fuel',
  manufacturer: 'mfr'
}

export function useCrossFilter() {
  const route = useRoute()
  const router = useRouter()

  // Filter state
  const organizations = ref<Set<string>>(new Set())
  const vehicles = ref<Set<string>>(new Set())
  const owners = ref<Set<string>>(new Set())
  const orbitTypes = ref<Set<string>>(new Set())
  const propellants = ref<Set<string>>(new Set())
  const manufacturers = ref<Set<string>>(new Set())

  // Initialize from URL query params
  function initFromUrl() {
    const orgParam = route.query[QUERY_KEYS.organization]
    const vehicleParam = route.query[QUERY_KEYS.vehicle]
    const ownerParam = route.query[QUERY_KEYS.owner]
    const orbitParam = route.query[QUERY_KEYS.orbitType]
    const propellantParam = route.query[QUERY_KEYS.propellant]
    const manufacturerParam = route.query[QUERY_KEYS.manufacturer]

    if (orgParam) {
      const values = Array.isArray(orgParam) ? orgParam : [orgParam]
      organizations.value = new Set(values.filter((v): v is string => typeof v === 'string'))
    }
    if (vehicleParam) {
      const values = Array.isArray(vehicleParam) ? vehicleParam : [vehicleParam]
      vehicles.value = new Set(values.filter((v): v is string => typeof v === 'string'))
    }
    if (ownerParam) {
      const values = Array.isArray(ownerParam) ? ownerParam : [ownerParam]
      owners.value = new Set(values.filter((v): v is string => typeof v === 'string'))
    }
    if (orbitParam) {
      const values = Array.isArray(orbitParam) ? orbitParam : [orbitParam]
      orbitTypes.value = new Set(values.filter((v): v is string => typeof v === 'string'))
    }
    if (propellantParam) {
      const values = Array.isArray(propellantParam) ? propellantParam : [propellantParam]
      propellants.value = new Set(values.filter((v): v is string => typeof v === 'string'))
    }
    if (manufacturerParam) {
      const values = Array.isArray(manufacturerParam) ? manufacturerParam : [manufacturerParam]
      manufacturers.value = new Set(values.filter((v): v is string => typeof v === 'string'))
    }
  }

  // Sync state to URL
  function syncToUrl() {
    const query: Record<string, string | string[]> = {}

    // Preserve existing non-filter query params
    for (const [key, value] of Object.entries(route.query)) {
      if (!Object.values(QUERY_KEYS).includes(key) && value !== undefined) {
        query[key] = value as string | string[]
      }
    }

    // Add filter params
    if (organizations.value.size > 0) {
      query[QUERY_KEYS.organization] = Array.from(organizations.value)
    }
    if (vehicles.value.size > 0) {
      query[QUERY_KEYS.vehicle] = Array.from(vehicles.value)
    }
    if (owners.value.size > 0) {
      query[QUERY_KEYS.owner] = Array.from(owners.value)
    }
    if (orbitTypes.value.size > 0) {
      query[QUERY_KEYS.orbitType] = Array.from(orbitTypes.value)
    }
    if (propellants.value.size > 0) {
      query[QUERY_KEYS.propellant] = Array.from(propellants.value)
    }
    if (manufacturers.value.size > 0) {
      query[QUERY_KEYS.manufacturer] = Array.from(manufacturers.value)
    }

    router.replace({ query })
  }

  // Toggle a filter value (add if not present, remove if present)
  function toggleFilter(type: FilterType, value: string) {
    const filterSet = getFilterSet(type)
    if (filterSet.value.has(value)) {
      filterSet.value.delete(value)
    } else {
      filterSet.value.add(value)
    }
    // Trigger reactivity by creating new Set
    filterSet.value = new Set(filterSet.value)
    syncToUrl()
  }

  // Add a filter value
  function addFilter(type: FilterType, value: string) {
    const filterSet = getFilterSet(type)
    if (!filterSet.value.has(value)) {
      filterSet.value.add(value)
      filterSet.value = new Set(filterSet.value)
      syncToUrl()
    }
  }

  // Remove a filter value
  function removeFilter(type: FilterType, value: string) {
    const filterSet = getFilterSet(type)
    if (filterSet.value.has(value)) {
      filterSet.value.delete(value)
      filterSet.value = new Set(filterSet.value)
      syncToUrl()
    }
  }

  // Clear all filters of a specific type
  function clearFilterType(type: FilterType) {
    const filterSet = getFilterSet(type)
    filterSet.value = new Set()
    syncToUrl()
  }

  // Clear all filters
  function clearAllFilters() {
    organizations.value = new Set()
    vehicles.value = new Set()
    owners.value = new Set()
    orbitTypes.value = new Set()
    propellants.value = new Set()
    manufacturers.value = new Set()
    syncToUrl()
  }

  // Helper to get the correct ref for a filter type
  function getFilterSet(type: FilterType): Ref<Set<string>> {
    switch (type) {
      case 'organization':
        return organizations
      case 'vehicle':
        return vehicles
      case 'owner':
        return owners
      case 'orbitType':
        return orbitTypes
      case 'propellant':
        return propellants
      case 'manufacturer':
        return manufacturers
    }
  }

  // Check if a value is selected for a filter type
  function isSelected(type: FilterType, value: string): boolean {
    return getFilterSet(type).value.has(value)
  }

  // Check if any filters are active
  const hasActiveFilters = computed(() => {
    return organizations.value.size > 0 ||
      vehicles.value.size > 0 ||
      owners.value.size > 0 ||
      orbitTypes.value.size > 0 ||
      propellants.value.size > 0 ||
      manufacturers.value.size > 0
  })

  // Get all active filters as an array for display
  const activeFilters = computed(() => {
    const filters: Array<{ type: FilterType; value: string; label: string }> = []

    for (const org of organizations.value) {
      filters.push({ type: 'organization', value: org, label: org })
    }
    for (const vehicle of vehicles.value) {
      filters.push({ type: 'vehicle', value: vehicle, label: vehicle })
    }
    for (const owner of owners.value) {
      filters.push({ type: 'owner', value: owner, label: owner })
    }
    for (const orbitType of orbitTypes.value) {
      filters.push({ type: 'orbitType', value: orbitType, label: orbitType })
    }
    for (const propellant of propellants.value) {
      filters.push({ type: 'propellant', value: propellant, label: propellant })
    }
    for (const manufacturer of manufacturers.value) {
      filters.push({ type: 'manufacturer', value: manufacturer, label: manufacturer })
    }

    return filters
  })

  // Initialize on creation
  initFromUrl()

  return {
    // State
    organizations,
    vehicles,
    owners,
    orbitTypes,
    propellants,
    manufacturers,
    hasActiveFilters,
    activeFilters,

    // Methods
    toggleFilter,
    addFilter,
    removeFilter,
    clearFilterType,
    clearAllFilters,
    isSelected,
    initFromUrl
  }
}
