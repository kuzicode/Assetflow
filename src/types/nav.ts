export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}
