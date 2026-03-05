const VALID_SECTIONS = ['s1', 's2', 's3', 's4', 's5'];

const SECTION_KEY_MAP = {
    s1: 'section1_offer',
    s2: 'section2_icp',
    s3: 'section3_positioning',
    s4: 'section4_copy',
    s5: 'section5_method',
};

const SECTION_ALT_KEY_MAP = {
    s1: 'section2_offer',
    s2: 'section1_icp',
    s3: '',
    s4: '',
    s5: '',
};

const SECTION_LABELS = {
    s1: 'Arquitetura da Oferta',
    s2: 'Perfil do ICP',
    s3: 'Posicionamento & Mensagem',
    s4: 'Fundamentos de Copy',
    s5: 'Arquitetura do Método',
};

module.exports = { VALID_SECTIONS, SECTION_KEY_MAP, SECTION_ALT_KEY_MAP, SECTION_LABELS };
