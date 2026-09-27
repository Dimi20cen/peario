class Meta {
    id: String;
    // The exact video picked (e.g. "tt123:2:1" for an episode); `id` is the whole show.
    videoId: String;
    type: String;
    name: String;
    description: String;
    year: Number;
    logo: String;
    poster: String;
    background: String;

    constructor(meta: any) {
        this.id = meta.id;
        this.videoId = meta.videoId || meta.id;
        this.type = meta.type;
        this.name = meta.name;
        this.description = meta.description;
        this.year = meta.year;
        this.logo = meta.logo;
        this.poster = meta.poster;
        this.background = meta.background;
    }
};

export default Meta;