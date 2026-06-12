export interface SidebarPresentation {
  toggleLabel: 'Collapse sidebar' | 'Expand sidebar';
  isIconOnly: boolean;
  ariaExpanded: boolean;
}

export function getSidebarPresentation(isCollapsed: boolean): SidebarPresentation {
  return {
    toggleLabel: isCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
    isIconOnly: isCollapsed,
    ariaExpanded: !isCollapsed,
  };
}
