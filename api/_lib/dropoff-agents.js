// Agents de dépôt Shopicar (drop-off) : où le client peut aller porter son auto au lieu d'une cueillette chez lui.
// Ajouter un agent = ajouter une ligne ici puis déployer. lat/lng facultatifs : sinon, le centre de la région
// postale (3 premiers caractères du code postal) sert au calcul de distance.
// Champs : id, nom, adresse, ville, postal, tel (facultatif), heures (texte affiché), lat, lng (facultatifs).
export const DROPOFF_AGENTS = [
  // { id: 'mtl-plateau', nom: 'Garage Exemple', adresse: '123, rue Exemple', ville: 'Montréal', postal: 'H2X 1Y4', tel: '514 555-0000', heures: 'Lun-ven 8 h à 18 h, sam 9 h à 14 h' },
];

// Mode démo seulement (phase privée) : points fictifs par région, sans adresse civique réelle.
export const DEMO_AGENTS = [
  { id: 'demo-mtl', nom: 'Agent Shopicar Montréal (démo)', adresse: 'Adresse transmise à la confirmation', ville: 'Montréal', postal: 'H2X', heures: 'Lun-sam 8 h à 20 h', demo: true },
  { id: 'demo-laval', nom: 'Agent Shopicar Laval (démo)', adresse: 'Adresse transmise à la confirmation', ville: 'Laval', postal: 'H7T', heures: 'Lun-sam 8 h à 20 h', demo: true },
  { id: 'demo-rs', nom: 'Agent Shopicar Rive-Sud (démo)', adresse: 'Adresse transmise à la confirmation', ville: 'Longueuil', postal: 'J4K', heures: 'Lun-sam 8 h à 20 h', demo: true },
  { id: 'demo-qc', nom: 'Agent Shopicar Québec (démo)', adresse: 'Adresse transmise à la confirmation', ville: 'Québec', postal: 'G1R', heures: 'Lun-sam 8 h à 20 h', demo: true },
  { id: 'demo-gat', nom: 'Agent Shopicar Gatineau (démo)', adresse: 'Adresse transmise à la confirmation', ville: 'Gatineau', postal: 'J8X', heures: 'Lun-sam 8 h à 20 h', demo: true },
  { id: 'demo-she', nom: 'Agent Shopicar Sherbrooke (démo)', adresse: 'Adresse transmise à la confirmation', ville: 'Sherbrooke', postal: 'J1H', heures: 'Lun-sam 8 h à 20 h', demo: true },
  { id: 'demo-tr', nom: 'Agent Shopicar Trois-Rivières (démo)', adresse: 'Adresse transmise à la confirmation', ville: 'Trois-Rivières', postal: 'G9A', heures: 'Lun-sam 8 h à 20 h', demo: true },
];
